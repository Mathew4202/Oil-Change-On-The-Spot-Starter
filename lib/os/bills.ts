// Every evening: pay-later bills past their due time get the late fee (once), then interest every 30 days,
// and the customer gets a text with the new amount and their pay link. Paid bills are never touched.
import { sbGet, sbPatch } from "@/lib/os/db";
import { lateRules, lateStep, owing } from "@/lib/os/bill-late";
import { payLink } from "@/lib/os/customer-texts";
import { sendSms, template, fill } from "@/lib/os/sms";

type Row = { id: string; booking_id: string; receipt_token: string; total: number; tip: number | null; late_fee: number | null; late_interest: number | null;
  bill_due_at: string; late_last_at: string | null; done_at: string;
  customers: { id: string; first_name: string | null; phone: string | null; sms_opt_out: boolean | null } | null;
  bookings: { paid_at: string | null; payments: { amount: number }[] | null } | null };

export async function chargeLateBills(now = new Date()) {
  const rules = lateRules(Object.fromEntries((await sbGet<{ key: string; value: number }>("pricing_rules?select=key,value")).map((x) => [x.key, Number(x.value)])));
  const rows = await sbGet<Row>(`jobs?select=id,booking_id,receipt_token,total,tip,late_fee,late_interest,bill_due_at,late_last_at,done_at,customers(id,first_name,phone,sms_opt_out),bookings(paid_at,payments(amount))` +
    `&bill_due_at=lt.${now.toISOString()}&limit=200`).catch(() => null);
  if (!rows) return { charged: 0, note: "run migration 0035" };
  let charged = 0;
  for (const j of rows) {
    if (j.bookings?.paid_at) continue;
    const paid = (j.bookings?.payments ?? []).reduce((t, p) => t + Number(p.amount), 0) - Number(j.tip ?? 0);
    const state = { total: Number(j.total), paid, lateFee: Number(j.late_fee ?? 0), lateInterest: Number(j.late_interest ?? 0), dueAt: j.bill_due_at, lateLastAt: j.late_last_at };
    const step = lateStep(state, now, rules);
    if (!step) continue;
    const next = { ...state, lateFee: step.lateFee ?? state.lateFee, lateInterest: Math.round((state.lateInterest + (step.addInterest ?? 0)) * 100) / 100 };
    await sbPatch("jobs", `id=eq.${j.id}`, { late_fee: next.lateFee, late_interest: next.lateInterest, late_last_at: now.toISOString() });
    charged++;
    const c = j.customers;
    if (!c?.phone || c.sms_opt_out) continue;
    const added = step.kind === "fee" ? `a $${step.lateFee!.toFixed(2)} late fee was added` : `$${step.addInterest!.toFixed(2)} interest was added`;
    const day = new Date(j.done_at).toLocaleDateString("en-CA", { timeZone: "America/Halifax", month: "short", day: "numeric" });
    const body = (await template("bill_overdue")) || "Hi {first_name}, your Oil Change On The Spot bill from {day} isn't paid yet, so {added}. You now owe {owing}. Pay here (card or e-transfer): {pay_link}\nIf you've already paid, just let us know!\n- Mathew";
    await sendSms(c.phone, fill(body, { first_name: c.first_name?.trim() || "there", day, added, owing: `$${owing(next).toFixed(2)}`, pay_link: payLink(j.receipt_token) }),
      { kind: "bill_overdue", customerId: c.id, bookingId: j.booking_id }).catch(() => null);
  }
  return { charged };
}
