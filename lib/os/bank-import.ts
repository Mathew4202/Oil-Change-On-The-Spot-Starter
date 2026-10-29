// Save an uploaded statement, match it, and handle the owner's decisions on lines that need a look.
import crypto from "crypto";
import { sbGet, sbInsert, sbPatch, sbHeaders, enc } from "@/lib/os/db";
import { halifaxDate } from "@/lib/os/slots";
import { lineKeys, matchStatement, type Parsed, type Result } from "@/lib/os/bank";

const shift = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const inList = (ids: string[]) => `(${ids.map(enc).join(",")})`;

export async function importStatement(p: Parsed, fileName: string, owner: string) {
  const keys = lineKeys(p.account, p.lines);
  const from = p.lines.reduce((m, l) => (l.date < m ? l.date : m), p.lines[0].date);
  const to = p.lines.reduce((m, l) => (l.date > m ? l.date : m), p.lines[0].date);

  const have = new Set((await sbGet<{ line_key: string }>(`bank_lines?select=line_key&account=eq.${enc(p.account)}&posted_on=gte.${from}&posted_on=lte.${to}`)).map((r) => r.line_key));
  const fresh = p.lines.map((l, i) => ({ l, key: keys[i] })).filter((x) => !have.has(x.key));
  const skipped = p.lines.length - fresh.length;
  if (!fresh.length) return { ok: true as const, account: p.account, from, to, added: 0, skipped, matched: 0, auto: 0, needsLook: 0 };

  const exps = (await sbGet<{ id: string; spent_at: string; total: number; supplier: string | null; vendor: string | null; paid_with: string | null }>(
    `expenses?select=id,spent_at,total,supplier,vendor,paid_with&bank_line_id=is.null&spent_at=gte.${shift(from, -75)}&spent_at=lte.${shift(to, 3)}`))
    .map((e) => ({ id: e.id, date: e.spent_at, total: Number(e.total), supplier: e.supplier, vendor: e.vendor, paid_with: e.paid_with }));
  const pays = (await sbGet<{ id: string; paid_at: string; amount: number; method: string | null }>(
    `payments?select=id,paid_at,amount,method&bank_line_id=is.null&method=eq.etransfer&paid_at=gte.${shift(from, -6)}&paid_at=lte.${shift(to, 2)}`))
    .map((x) => ({ id: x.id, date: halifaxDate(new Date(x.paid_at)), amount: Number(x.amount), method: x.method }));

  // bills we sent that aren't paid yet (an e-transfer for one marks it paid)
  const owedRows = await sbGet<{ id: string; starts_at: string; customers: { first_name: string | null; last_name: string | null } | null; jobs: { receipt_no: number | null; total: number | null; tip: number | null }[] | null; payments: { amount: number }[] | null }>(
    `bookings?select=id,starts_at,customers(first_name,last_name),jobs(receipt_no,total,tip),payments(amount)&status=eq.done&paid_at=is.null&pay_mode=neq.fleet_invoice&starts_at=gte.${shift(from, -45)}`).catch(() => []);
  const owed = owedRows.filter((b) => b.jobs?.[0]?.total != null).map((b) => ({ bookingId: b.id, date: halifaxDate(new Date(b.starts_at)), receiptNo: b.jobs![0].receipt_no,
    due: Math.round((Number(b.jobs![0].total) - (b.payments ?? []).reduce((t, x) => t + Number(x.amount), 0)) * 100) / 100,
    name: [b.customers?.first_name, b.customers?.last_name].filter(Boolean).join(" ") || "Customer" })).filter((o) => o.due > 0);
  const results = matchStatement(fresh.map((x) => x.l), exps, pays, owed);
  const imp = await sbInsert<{ id: string }>("bank_imports", { file_name: fileName.slice(0, 120), account: p.account, from_date: from, to_date: to, lines: fresh.length, added_by: owner });
  if (!imp.ok) return { ok: false as const, error: `Couldn't save the statement: ${JSON.stringify(imp.error).slice(0, 200)}` };

  const rows = results.map((r, i) => ({
    id: crypto.randomUUID(), import_id: imp.data!.id, account: p.account, posted_on: r.date, amount: r.amount, description: r.description.slice(0, 300),
    line_key: fresh[i].key, status: r.status, kind: r.kind, category: r.category, expense_ids: r.expenseIds, payment_id: r.paymentId, note: r.note,
  }));
  // bank fees go straight into spending (no receipt exists for them)
  const feeExpenses = rows.flatMap((row, i) => results[i].kind === "bank_fee" && results[i].status === "auto" ? [{ row, exp: feeExpense(row) }] : []);
  for (const f of feeExpenses) f.row.expense_ids = [f.exp.id];

  const ins = await sbInsert("bank_lines", rows);
  if (!ins.ok) return { ok: false as const, error: `Couldn't save the lines: ${JSON.stringify(ins.error).slice(0, 200)}` };
  const now = new Date().toISOString();
  for (const f of feeExpenses) await sbInsert("expenses", f.exp);
  for (const row of rows) {
    if (row.status === "matched" && row.expense_ids.length) await sbPatch("expenses", `id=in.${inList(row.expense_ids)}`, { bank_line_id: row.id, bank_matched_at: now });
    if (row.payment_id) await sbPatch("payments", `id=eq.${enc(row.payment_id)}`, { bank_line_id: row.id });
  }
  // e-transfers that pay a bill we sent: record the payment (marks the job paid) and email the paid receipt
  for (const [i, r] of results.entries()) {
    if (!r.owedBookingId) continue;
    const { recordPayment, sendReceipt } = await import("@/lib/os/jobs");
    await recordPayment(r.owedBookingId, Math.abs(r.amount), "etransfer", `${owner} (bank statement)`).catch(() => null);
    const [pay] = await sbGet<{ id: string }>(`payments?select=id&booking_id=eq.${r.owedBookingId}&order=paid_at.desc&limit=1`).catch(() => []);
    if (pay) { await sbPatch("payments", `id=eq.${pay.id}`, { bank_line_id: rows[i].id }).catch(() => null); await sbPatch("bank_lines", `id=eq.${rows[i].id}`, { payment_id: pay.id }).catch(() => null); }
    const [jb] = await sbGet<{ id: string }>(`jobs?select=id&booking_id=eq.${r.owedBookingId}&limit=1`).catch(() => []);
    if (jb) await sendReceipt(jb.id, null).catch(() => null);
  }
  const count = (s: Result["status"]) => results.filter((r) => r.status === s).length;
  return { ok: true as const, account: p.account, from, to, added: fresh.length, skipped, matched: count("matched"), auto: count("auto"), needsLook: count("needs_look") };
}

function feeExpense(row: { id: string; posted_on: string; amount: number; description: string }, category = "bank_fees") {
  const amt = Math.abs(row.amount);
  return { id: crypto.randomUUID(), vendor: "BMO", description: row.description, category, total: amt, subtotal: amt, hst: 0,
    spent_at: row.posted_on, paid_with: "bank", source: "bank", bank_line_id: row.id, bank_matched_at: new Date().toISOString() };
}

type Line = { id: string; posted_on: string; amount: number; description: string; status: string; kind: string | null; expense_ids: string[] | null };

/** expense = add it to spending with no receipt; personal = not business; ok = checked, nothing to do; undo = back to "needs a look". */
export async function decideLine(id: string, action: "expense" | "personal" | "ok" | "undo", category: string | null, owner: string) {
  const [l] = await sbGet<Line>(`bank_lines?select=id,posted_on,amount,description,status,kind,expense_ids&id=eq.${enc(id)}`);
  if (!l) return { ok: false as const, error: "Line not found" };
  if (action === "undo") {
    if (l.kind === "expense_no_receipt" && l.expense_ids?.length) await fetchDelete(`expenses?id=in.${inList(l.expense_ids)}&source=eq.bank`);
    await sbPatch("bank_lines", `id=eq.${enc(id)}`, { status: "needs_look", kind: l.amount < 0 ? "receipt" : "money_in", expense_ids: [], decided_by: null });
    return { ok: true as const };
  }
  if (l.status !== "needs_look") return { ok: false as const, error: "Already sorted" };
  if (action === "expense") {
    if (l.amount >= 0) return { ok: false as const, error: "That's money in, not spending" };
    const exp = feeExpense({ ...l, amount: Number(l.amount) }, category || "other");
    const r = await sbInsert("expenses", { ...exp, vendor: l.description.replace(/^\[[A-Z]{2}\]/, "").slice(0, 60), added_by: owner });
    if (!r.ok) return { ok: false as const, error: "Couldn't add it" };
    await sbPatch("bank_lines", `id=eq.${enc(id)}`, { status: "done", kind: "expense_no_receipt", category: category || "other", expense_ids: [exp.id], decided_by: owner });
    return { ok: true as const };
  }
  await sbPatch("bank_lines", `id=eq.${enc(id)}`, { status: "done", kind: action === "personal" ? "personal" : l.amount > 0 ? "money_in" : l.kind, decided_by: owner });
  return { ok: true as const };
}

async function fetchDelete(path: string) {
  await fetch(`${process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, { method: "DELETE", headers: sbHeaders() });
}

/** After a receipt is snapped, tick off the bank line it belongs to (if the statement is already in). */
export async function linkReceiptToBank(expenseId: string, total: number, date: string, paidWith: string) {
  if (paidWith === "on_account" || paidWith === "cash") return null;
  const want = -Math.abs(total);
  const [l] = await sbGet<{ id: string }>(`bank_lines?select=id&status=eq.needs_look&amount=eq.${want.toFixed(2)}&posted_on=gte.${shift(date, -3)}&posted_on=lte.${shift(date, 7)}&order=posted_on.asc&limit=1`);
  if (!l) return null;
  await sbPatch("bank_lines", `id=eq.${l.id}`, { status: "matched", kind: "receipt", expense_ids: [expenseId] });
  await sbPatch("expenses", `id=eq.${enc(expenseId)}`, { bank_line_id: l.id, bank_matched_at: new Date().toISOString() });
  return l.id;
}
