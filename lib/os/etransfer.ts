// An Interac e-Transfer email came in (forwarded by the Google script in the business Gmail): match it to the bill it pays,
// mark it paid by e-transfer (anything over what was owed is a tip), send the receipt, and tell the owners.
import { sbGet, sbInsert, enc } from "@/lib/os/db";
import { parseInterac, nameMatches } from "@/lib/os/etransfer-parse";
import { pushToOwners } from "@/lib/os/push";

const r2 = (n: number) => Math.round(n * 100) / 100;
type Job = { id: string; booking_id: string | null; receipt_no: number | null; total: number; tip: number | null; late_fee: number | null; late_interest: number | null; done_at: string; imported_from: string | null;
  customers: { first_name: string | null; last_name: string | null } | null };

async function tell(title: string, body: string, url = "/owner/money") {
  try { await sbInsert("notifications", { kind: "paid_etransfer", title, body }); } catch { /* best effort */ }
  await Promise.race([pushToOwners({ title, body, url, tag: `et-${Date.now()}` }).catch(() => null), new Promise((r) => setTimeout(r, 3000))]);
}

export async function applyEtransfer(e: { id: string; subject: string; body: string; date?: string }) {
  const key = `etransfer:${String(e.id).slice(0, 80)}`;
  const [seen] = await sbGet<{ id: string }>(`webhook_log?select=id&type=eq.${enc(key)}&limit=1`).catch(() => []);
  if (seen) return { ok: true, duplicate: true };
  const p = parseInterac(e.subject || "", e.body || "");
  await sbInsert("webhook_log", { type: key, body: { subject: e.subject, amount: p.amount, sender: p.sender, message: p.message, refs: p.refs } }).catch(() => null);
  if (!p.amount) return { ok: false, reason: "no amount in the email" };
  if (!/sent you|deposit|e-?transfer/i.test(`${e.subject} ${e.body}`)) return { ok: false, reason: "not a received e-transfer" };

  const { visitGroup, owedOn, payVisit, recordPayment, sendReceipt, reviewIfDue } = await import("@/lib/os/jobs");
  const visitKey: Record<string, string> = {};   // several cars on one visit count as one bill
  const owedFor = async (j: Job) => {
    if (!j.booking_id) return 0;
    const visit = await visitGroup(j.booking_id).catch(() => []);
    visitKey[j.booking_id] = visit[0]?.bookingId ?? j.booking_id;
    if (visit.length) return r2(visit.reduce((t, c) => t + owedOn(c), 0));
    const pays = await sbGet<{ amount: number }>(`payments?select=amount&booking_id=eq.${j.booking_id}`);
    const paid = pays.reduce((t, x) => t + Number(x.amount), 0) - Number(j.tip ?? 0);
    return Math.max(0, r2(Number(j.total) + Number(j.late_fee ?? 0) + Number(j.late_interest ?? 0) - paid));
  };
  const SEL = "id,booking_id,receipt_no,total,tip,late_fee,late_interest,done_at,imported_from,customers(first_name,last_name)";

  // 1) the receipt number in their message; 2) else their name + an unpaid bill from the last 45 days (only if there's exactly one)
  let job: Job | null = null, owed = 0, how = "";
  if (p.refs.length) {
    for (const j of await sbGet<Job>(`jobs?select=${SEL}&receipt_no=in.(${p.refs.join(",")})&imported_from=is.null`)) {
      const o = await owedFor(j); if (o > 0.009) { job = j; owed = o; how = `receipt #${j.receipt_no} in the message`; break; }
    }
  }
  if (!job) {
    const since = new Date(Date.now() - 45 * 86400000).toISOString();
    const open = (await sbGet<Job>(`jobs?select=${SEL}&imported_from=is.null&payment_method=is.null&done_at=gte.${since}&order=done_at.desc&limit=100`))
      .filter((j) => nameMatches(p.sender, j.customers?.first_name ?? null, j.customers?.last_name ?? null));
    const owing: { j: Job; o: number }[] = [];
    for (const j of open) { const o = await owedFor(j); if (o > 0.009 && !owing.some((x) => visitKey[x.j.booking_id!] === visitKey[j.booking_id!])) owing.push({ j, o }); }
    if (owing.length === 1) { job = owing[0].j; owed = owing[0].o; how = "their name matches the only unpaid bill"; }
  }
  if (!job || !job.booking_id) {
    await tell(`E-transfer in: $${p.amount.toFixed(2)} from ${p.sender ?? "someone"}`, `Couldn't match it to a bill${p.message ? ` (message: "${p.message.slice(0, 60)}")` : ""}. Mark the right job paid in HQ.`);
    return { ok: true, matched: false };
  }

  const who = [job.customers?.first_name, job.customers?.last_name].filter(Boolean).join(" ") || p.sender || "Customer";
  const extra = r2(p.amount - owed);
  if (extra < -0.009) {
    // paid part of it
    await recordPayment(job.booking_id, p.amount, "etransfer", `Interac email (${p.sender ?? "?"})`, 0);
    await tell(`Part payment: $${p.amount.toFixed(2)} from ${who}`, `Receipt #${job.receipt_no}: $${(-extra).toFixed(2)} is still owed.`, `/owner?date=${job.done_at.slice(0, 10)}`);
    return { ok: true, matched: true, partial: true };
  }
  // anything over what was owed is a tip (a big overpayment is flagged instead, to sort out)
  const tip = extra > 0.009 && extra <= Math.max(50, owed * 0.3) ? extra : 0;
  if (!(await payVisit(job.booking_id, "etransfer", `Interac email (${p.sender ?? "?"})`, tip, { noReview: true }).catch(() => false))) await recordPayment(job.booking_id, owed, "etransfer", `Interac email (${p.sender ?? "?"})`, tip, { noReview: true });
  await sendReceipt(job.id, null).catch(() => null);   // receipt first, then the thank-you
  await reviewIfDue(job.booking_id).catch(() => null);
  await tell(`Paid by e-transfer: $${p.amount.toFixed(2)} from ${who}`,
    `Receipt #${job.receipt_no} marked paid${tip ? `, incl. a $${tip.toFixed(2)} tip` : ""} (${how}).${extra > 0.009 && !tip ? ` They sent $${extra.toFixed(2)} more than owed: check it.` : ""} Receipt sent.`, `/owner?date=${job.done_at.slice(0, 10)}`);
  return { ok: true, matched: true, receiptNo: job.receipt_no, tip };
}
