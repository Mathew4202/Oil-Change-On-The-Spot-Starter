// Pay-later bills: due 48 hours after we send them. Not paid by then: a flat late fee once, then interest each month
// on what's still owing. Late charges have no HST (they're treated as interest). Pure, so it's tested on its own.
export type LateRules = { dueHours: number; fee: number; monthlyPct: number };
export const lateRules = (r: Record<string, number>): LateRules => ({
  dueHours: Number(r.bill_due_hours ?? 48), fee: Number(r.late_fee ?? 10), monthlyPct: Number(r.late_interest_monthly_pct ?? 2) });

export type BillState = { total: number; paid: number; lateFee: number; lateInterest: number; dueAt: string | null; lateLastAt: string | null };
const r2 = (x: number) => Math.round(x * 100) / 100;
const DAY = 86400000;

/** What they owe right now, late charges included. */
export const owing = (b: Pick<BillState, "total" | "paid" | "lateFee" | "lateInterest">) => r2(Math.max(0, b.total + (b.lateFee || 0) + (b.lateInterest || 0) - b.paid));

/** What to add today, if anything: the late fee once the deadline passes, then interest every 30 days after. */
export function lateStep(b: BillState, now: Date, rules: LateRules): { lateFee?: number; addInterest?: number; kind: "fee" | "interest" } | null {
  if (!b.dueAt || owing(b) <= 0 || now.getTime() < new Date(b.dueAt).getTime()) return null;
  if (!b.lateFee && rules.fee > 0) return { lateFee: r2(rules.fee), kind: "fee" };
  const last = new Date(b.lateLastAt || b.dueAt).getTime();
  if (rules.monthlyPct > 0 && now.getTime() - last >= 30 * DAY) return { addInterest: r2(owing(b) * rules.monthlyPct / 100), kind: "interest" };
  return null;
}

/** The line the customer reads on their bill, so they know before it's late. */
export function lateTerms(rules: LateRules) {
  const fee = rules.fee > 0 ? `a $${rules.fee.toFixed(rules.fee % 1 ? 2 : 0)} late fee is added` : "";
  const pct = rules.monthlyPct > 0 ? `${rules.monthlyPct}% interest each month on what's still owing` : "";
  const after = fee && pct ? `${fee}, then ${pct}` : fee || (pct ? `${pct} is added` : "");
  return `Please pay within ${rules.dueHours} hours.${after ? ` After that ${after}.` : ""}`;
}
