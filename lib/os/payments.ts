// Pay online: what a pay link is for, starting a Converge payment, and recording it once Converge confirms it.
import { sbGet, sbInsert, sbPatch, sbPatchRows, enc } from "@/lib/os/db";
import { recordPayment, sendReceipt } from "@/lib/os/jobs";
import { markInvoicePaid } from "@/lib/os/fleet";
import { markBillPaid } from "@/lib/os/plans";
import { siteUrl } from "@/lib/os/customer-texts";
import { pushToOwners } from "@/lib/os/push";
import { amountDue, convergeEnv, invoiceFor, judge, parseAscii, payPageUrl, processUrl, queryForm, tokenForm, tokenUrl } from "@/lib/os/converge";

export const payReady = () => !!convergeEnv();
const r2 = (n: number) => Math.round(n * 100) / 100;

export type PayTarget = {
  kind: "job" | "prepay" | "invoice" | "plan";
  bookingId: string | null; jobId: string | null; invoiceId?: string | null; planBillId?: string | null; token: string;
  title: string; car: string; when: string | null;
  lines: { label: string; amount: number }[]; subtotal: number; hst: number; total: number;
  paid: number; due: number; ref?: string | null;   // receipt or invoice number, for the e-transfer message
  firstName: string | null; lastName: string | null; email: string | null;
  receiptUrl: string | null;
};

type Cust = { first_name: string | null; last_name: string | null; email: string | null } | null;
type Veh = { year: number | null; make: string | null; model: string | null } | null;
const carText = (v: Veh) => [v?.year, v?.make, v?.model].filter(Boolean).join(" ");

async function paidSoFar(bookingId: string) {
  const rows = await sbGet<{ amount: number }>(`payments?select=amount&booking_id=eq.${enc(bookingId)}`);
  return r2(rows.reduce((t, p) => t + Number(p.amount), 0));
}

/** A pay link token is either a receipt (pay after the job, or a cancellation fee) or a booking's own link (pay before). */
export async function payTarget(token: string): Promise<PayTarget | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const [j] = await sbGet<{ id: string; receipt_no: number | null; late_fee: number | null; late_interest: number | null; bill_due_at: string | null; booking_id: string | null; service: string | null; lines: { label: string; amount: number }[] | null; subtotal: number; hst: number; total: number;
    tip: number | null; vehicle_text: string | null; imported_from: string | null; customers: Cust }>(
    `jobs?select=id,receipt_no,booking_id,service,late_fee,late_interest,bill_due_at,lines,subtotal,hst,total,tip,vehicle_text,imported_from,customers(first_name,last_name,email)&receipt_token=eq.${enc(token)}&limit=1`);
  if (j) {
    if (!j.booking_id || j.imported_from) return null;
    // a tip already paid isn't part of what was owed
    const paid = r2((await paidSoFar(j.booking_id)) - Number(j.tip ?? 0));
    // a late pay-later bill: the late fee and interest are part of what's owed (no HST on them)
    const late = [Number(j.late_fee) > 0 ? { label: "Late fee", amount: Number(j.late_fee) } : null, Number(j.late_interest) > 0 ? { label: "Interest on late payment", amount: Number(j.late_interest) } : null].filter(Boolean) as { label: string; amount: number }[];
    const total = r2(Number(j.total) + late.reduce((t, l) => t + l.amount, 0));
    return { kind: "job", bookingId: j.booking_id, jobId: j.id, token, title: j.service === "cancellation_fee" ? "Same-day cancellation fee" : "Your service",
      car: j.vehicle_text || "", when: null, lines: [...(j.lines ?? []), ...late], subtotal: Number(j.subtotal), hst: Number(j.hst), total, paid: Math.max(0, paid), due: amountDue(total, paid),
      firstName: j.customers?.first_name ?? null, lastName: j.customers?.last_name ?? null, email: j.customers?.email ?? null, receiptUrl: `/receipt/${token}`, ref: j.receipt_no ? String(j.receipt_no) : null };
  }
  // a maintenance plan monthly payment
  const [pb] = await sbGet<{ id: string; period: string; subtotal: number; hst: number; total: number; status: string; plans: { name: string | null; car: string | null } | null }>(
    `plan_bills?select=id,period,subtotal,hst,total,status,plans(name,car)&token=eq.${enc(token)}&limit=1`).catch(() => []);
  if (pb) {
    if (pb.status === "void") return null;
    const total = Number(pb.total), paid = pb.status === "paid" ? total : 0;
    const month = new Date(`${pb.period}T12:00:00Z`).toLocaleDateString("en-CA", { month: "long", year: "numeric", timeZone: "UTC" });
    const [fn, ...ln] = (pb.plans?.name || "").split(/\s+/);
    return { kind: "plan", bookingId: null, jobId: null, planBillId: pb.id, token, title: `Maintenance plan, ${month}`, car: pb.plans?.car ?? "", when: null,
      lines: [{ label: `Maintenance plan, ${month}`, amount: Number(pb.subtotal) }], subtotal: Number(pb.subtotal), hst: Number(pb.hst), total, paid, due: amountDue(total, paid),
      firstName: fn || null, lastName: ln.join(" ") || null, email: null, receiptUrl: null };
  }
  // a fleet invoice
  const [inv] = await sbGet<{ id: string; invoice_no: number; status: string; lines: { unit: string | null; vehicle: string; amount: number }[]; subtotal: number; hst: number; total: number;
    fleet_accounts: { business_name: string; contact_name: string | null; email: string | null; invoice_email: string | null } | null }>(
    `invoices?select=id,invoice_no,status,lines,subtotal,hst,total,fleet_accounts(business_name,contact_name,email,invoice_email)&token=eq.${enc(token)}&limit=1`).catch(() => []);
  if (inv) {
    if (inv.status === "void") return null;
    const total = Number(inv.total), paid = inv.status === "paid" ? total : 0;
    const [first, ...rest] = (inv.fleet_accounts?.contact_name || "").split(/\s+/);
    return { kind: "invoice", bookingId: null, jobId: null, invoiceId: inv.id, token, title: `Invoice #${inv.invoice_no}`, car: inv.fleet_accounts?.business_name ?? "", when: null,
      lines: (inv.lines ?? []).map((l) => ({ label: `${l.unit ? `Unit ${l.unit} · ` : ""}${l.vehicle}`, amount: Number(l.amount) })), subtotal: Number(inv.subtotal), hst: Number(inv.hst), total,
      paid, due: amountDue(total, paid), firstName: first || null, lastName: rest.join(" ") || null, email: inv.fleet_accounts?.invoice_email || inv.fleet_accounts?.email || null, receiptUrl: `/invoice/${token}`, ref: String(inv.invoice_no) };
  }
  const [b] = await sbGet<{ id: string; status: string; starts_at: string; quoted_total: number | null; quote_breakdown: { lines?: { label: string; amount: number }[]; subtotal?: number; hst?: number } | null;
    customers: Cust; vehicles: Veh }>(
    `bookings?select=id,status,starts_at,quoted_total,quote_breakdown,customers(first_name,last_name,email),vehicles(year,make,model)&manage_token=eq.${enc(token)}&limit=1`);
  if (!b) return null;
  if (!["confirmed", "requested"].includes(b.status)) {
    // job's done (or it was cancelled with a fee): the booking's link now shows that receipt
    const [j2] = await sbGet<{ receipt_token: string }>(`jobs?select=receipt_token&booking_id=eq.${b.id}&order=done_at.desc&limit=1`);
    return j2?.receipt_token && j2.receipt_token !== token ? payTarget(j2.receipt_token) : null;
  }
  if (b.quoted_total == null) return null;
  // several cars on one visit: the first car's link pays for all of them
  const group = await groupOf(b.id);
  if (group.length > 1) {
    const total = r2(group.reduce((t, g) => t + Number(g.quoted_total ?? 0), 0));
    let paid = 0; for (const g of group) paid += await paidSoFar(g.id);
    const lines = group.flatMap((g) => (g.quote_breakdown?.lines ?? []).map((l) => ({ label: `${carText(g.vehicles)}: ${l.label}`, amount: l.amount })));
    const subtotal = r2(lines.reduce((t, l) => t + l.amount, 0));
    return { kind: "prepay", bookingId: b.id, jobId: null, token, title: "Your booking", car: group.map((g) => carText(g.vehicles)).join(" and "), when: b.starts_at,
      lines, subtotal, hst: r2(total - subtotal), total, paid: r2(paid), due: amountDue(total, paid),
      firstName: b.customers?.first_name ?? null, lastName: b.customers?.last_name ?? null, email: b.customers?.email ?? null, receiptUrl: null };
  }
  const total = Number(b.quoted_total), paid = await paidSoFar(b.id);
  const lines = b.quote_breakdown?.lines ?? [];
  const subtotal = r2(b.quote_breakdown?.subtotal ?? lines.reduce((t, l) => t + l.amount, 0));
  return { kind: "prepay", bookingId: b.id, jobId: null, token, title: "Your booking", car: carText(b.vehicles), when: b.starts_at,
    lines, subtotal, hst: r2(b.quote_breakdown?.hst ?? total - subtotal), total, paid, due: amountDue(total, paid),
    firstName: b.customers?.first_name ?? null, lastName: b.customers?.last_name ?? null, email: b.customers?.email ?? null, receiptUrl: null };
}

type GroupRow = { id: string; quoted_total: number | null; quote_breakdown: { lines?: { label: string; amount: number }[] } | null; vehicles: Veh };
/** The bookings booked together with this one (just itself if it's a single car). */
async function groupOf(bookingId: string): Promise<GroupRow[]> {
  try {
    const [me] = await sbGet<{ group_id: string | null }>(`bookings?select=group_id&id=eq.${enc(bookingId)}`);
    if (!me?.group_id) return [];
    return await sbGet<GroupRow>(`bookings?select=id,quoted_total,quote_breakdown,vehicles(year,make,model)&group_id=eq.${me.group_id}&status=in.(confirmed,requested)&order=starts_at`);
  } catch { return []; }   // migration 0020 not run yet
}

const form = (f: Record<string, string>) => new URLSearchParams(f).toString();

/** Make a Converge payment for what's owed (+ tip, only after the job). Returns the page to send the customer to. */
export async function startOnlinePayment(token: string, tipIn: number): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const c = convergeEnv();
  if (!c) return { ok: false, error: "Online payment isn't switched on yet." };
  const t = await payTarget(token);
  if (!t) return { ok: false, error: "This pay link isn't valid anymore." };
  if (t.due <= 0) return { ok: false, error: "This is already paid. Thank you!" };
  const tip = t.kind === "job" ? r2(Math.min(500, Math.max(0, tipIn || 0))) : 0;
  const amount = r2(t.due + tip);
  const row = await sbInsert<{ id: string }>("online_payments", { booking_id: t.bookingId, job_id: t.jobId, kind: t.kind, amount, tip, status: "started", ...(t.invoiceId ? { invoice_id: t.invoiceId } : {}), ...(t.planBillId ? { plan_bill_id: t.planBillId } : {}) });
  if (!row.ok || !row.data?.id) return { ok: false, error: "Couldn't start the payment. Please try again." };
  const id = row.data.id;
  const res = await fetch(tokenUrl(c), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form(tokenForm(c, { paymentId: id, amount, description: `Oil Change On The Spot: ${t.title}${t.car ? `, ${t.car}` : ""}`,
      returnUrl: `${siteUrl()}/api/os/pay/return?p=${id}`, firstName: t.firstName, lastName: t.lastName, email: t.email })) }).catch(() => null);
  const text = res ? (await res.text()).trim() : "";
  if (!res?.ok || !text || /[<\s=]/.test(text)) {   // a token is one plain string; anything else is an error page
    await sbPatch("online_payments", `id=eq.${id}`, { status: "error", message: text.slice(0, 300) || "no answer", finished_at: new Date().toISOString() });
    return { ok: false, error: "The payment page didn't open. Please try again, or call or text us." };
  }
  return { ok: true, url: payPageUrl(c, text) };
}

type OnlineRow = { id: string; booking_id: string; job_id: string | null; invoice_id?: string | null; plan_bill_id?: string | null; kind: "job" | "prepay" | "invoice" | "plan"; amount: number; tip: number; status: string };

/** Converge sent them back. Check the transaction with Converge itself, then record it once. Returns the pay link token to show. */
export async function finishOnlinePayment(paymentId: string, txnId: string | null): Promise<{ token: string | null; status: "approved" | "declined" | "error" }> {
  const [p] = await sbGet<OnlineRow>(`online_payments?select=id,booking_id,job_id,invoice_id,plan_bill_id,kind,amount,tip,status&id=eq.${enc(paymentId)}`);
  if (!p) return { token: null, status: "error" };
  const token = await tokenOf(p);
  if (p.status === "approved") return { token, status: "approved" };    // refresh / back button
  const c = convergeEnv();
  if (!c || !txnId || !/^[A-Za-z0-9-]{4,64}$/.test(txnId)) {
    await sbPatch("online_payments", `id=eq.${p.id}&status=eq.started`, { status: "declined", message: "no transaction id", finished_at: new Date().toISOString() });
    return { token, status: "declined" };
  }
  const res = await fetch(processUrl(c), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form(queryForm(c, txnId)) }).catch(() => null);
  const q = res?.ok ? parseAscii(await res.text()) : { errorMessage: "Converge didn't answer" };
  const v = judge(q, { amount: Number(p.amount), invoice: invoiceFor(p.id) });
  if (!v.approved) {
    await sbPatch("online_payments", `id=eq.${p.id}&status=eq.started`, { status: "declined", message: `${txnId}: ${v.reason}`.slice(0, 300), card_last4: v.last4, finished_at: new Date().toISOString() });
    return { token, status: "declined" };
  }
  // claim it: only the request that flips started → approved records the money (the txn id is unique too)
  const claimed = await sbPatchRows("online_payments", `id=eq.${p.id}&status=eq.started`, { status: "approved", txn_id: txnId, card_last4: v.last4, message: null, finished_at: new Date().toISOString() });
  if (!claimed.length) {
    // someone else already recorded it (a double tap), or the save failed: only say approved if it really is
    const [now] = await sbGet<{ status: string }>(`online_payments?select=status&id=eq.${p.id}`);
    return { token, status: now?.status === "approved" ? "approved" : "error" };
  }
  await recordOnline(p, txnId, v.last4);
  return { token, status: "approved" };
}

async function tokenOf(p: OnlineRow) {
  if (p.plan_bill_id) { const [b] = await sbGet<{ token: string }>(`plan_bills?select=token&id=eq.${p.plan_bill_id}`); return b?.token ?? null; }
  if (p.invoice_id) { const [i] = await sbGet<{ token: string }>(`invoices?select=token&id=eq.${p.invoice_id}`); return i?.token ?? null; }
  if (p.job_id) { const [j] = await sbGet<{ receipt_token: string }>(`jobs?select=receipt_token&id=eq.${p.job_id}`); return j?.receipt_token ?? null; }
  const [b] = await sbGet<{ manage_token: string }>(`bookings?select=manage_token&id=eq.${p.booking_id}`); return b?.manage_token ?? null;
}

async function recordOnline(p: OnlineRow, txnId: string, last4: string | null) {
  const amount = Number(p.amount), tip = Number(p.tip || 0);
  const ref = `Converge ${txnId}${last4 ? `, card ending ${last4}` : ""}`;
  if (p.kind === "plan" && p.plan_bill_id) {
    await markBillPaid(p.plan_bill_id, "card_online", ref);
    try { await sbInsert("notifications", { kind: "paid_online", title: `Plan payment in: $${amount.toFixed(2)}`, body: ref }); } catch { /* best effort */ }
    return;
  }
  if (p.kind === "invoice" && p.invoice_id) {
    await markInvoicePaid(p.invoice_id, "card_online", "online");
    await sbPatch("invoices", `id=eq.${p.invoice_id}`, { notes: ref });
    const [i] = await sbGet<{ invoice_no: number }>(`invoices?select=invoice_no&id=eq.${p.invoice_id}`);
    try { await sbInsert("notifications", { kind: "paid_online", title: `Invoice #${i?.invoice_no ?? ""} paid online: $${amount.toFixed(2)}`, body: ref }); } catch { /* best effort */ }
    await Promise.race([pushToOwners({ title: `Invoice #${i?.invoice_no ?? ""} paid online`, body: `$${amount.toFixed(2)} by card`, url: "/owner/fleets", tag: `paid-${p.id}` }).catch(() => null), new Promise((r) => setTimeout(r, 4000))]);
    return;
  } else if (p.kind === "job") {
    await recordPayment(p.booking_id, r2(amount - tip), "card_online", "online", tip);
    // recordPayment writes "recorded by online"; put the Converge reference on it
    const [pay] = await sbGet<{ id: string }>(`payments?select=id&booking_id=eq.${p.booking_id}&method=eq.card_online&order=paid_at.desc&limit=1`);
    if (pay) await sbPatch("payments", `id=eq.${pay.id}`, { processor_ref: `${ref}${tip ? `, includes $${tip.toFixed(2)} tip` : ""}` });
    if (p.job_id) await sendReceipt(p.job_id, null).catch(() => null);
  } else {
    // paid for every car on the visit: one payment row per car, so each job sees its own share
    const group = await groupOf(p.booking_id);
    const parts = group.length > 1 ? group.map((g) => ({ id: g.id, amount: Number(g.quoted_total ?? 0) })) : [{ id: p.booking_id, amount }];
    const diff = r2(amount - parts.reduce((t, x) => t + x.amount, 0));
    if (diff) parts[0].amount = r2(parts[0].amount + diff);   // anything paid before is already netted out
    for (const x of parts) {
      if (x.amount > 0) await sbInsert("payments", { booking_id: x.id, amount: x.amount, method: "card_online", processor_ref: ref });
      await sbPatch("bookings", `id=eq.${x.id}`, { pay_mode: "online", paid_at: new Date().toISOString() });
    }
  }
  try { await sbInsert("notifications", { kind: "paid_online", booking_id: p.booking_id, title: `Paid online: $${amount.toFixed(2)}`, body: p.kind === "prepay" ? "Paid when booking" : tip ? `Includes a $${tip.toFixed(2)} tip` : "Paid after the job" }); } catch { /* best effort */ }
  await Promise.race([pushToOwners({ title: `Paid online: $${amount.toFixed(2)}`, body: p.kind === "prepay" ? "Paid when booking" : "Paid after the job", url: "/owner/money", tag: `paid-${p.id}` }).catch(() => null), new Promise((r) => setTimeout(r, 4000))]);
}
