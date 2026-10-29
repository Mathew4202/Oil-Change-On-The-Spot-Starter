// Discounts that come off by themselves. Pure, so they are tested on their own.
//  - The Christmas deal: $10 off each oil change for visits from Dec 1 to Jan 1, every year (rule christmas_discount).
//  - Credits on the customer's account (a friend they referred finished their first visit): off the next booking.

export type Line = { label: string; amount: number };
export type Priced = { lines: Line[]; subtotal: number; hst: number; total: number; profit?: number | null };
const r2 = (x: number) => Math.round(x * 100) / 100;

/** "YYYY-MM-DD" (Halifax) of the visit → is it in the Christmas deal (Dec 1 to Jan 1, both days included)? */
export function inChristmas(date: string) {
  const md = date.slice(5, 10);
  return md >= "12-01" || md === "01-01";
}

/** The Christmas line for this visit, if any: per oil change (several cars on one booking each get it). */
export function christmasLine(date: string | null | undefined, job: string | undefined, cars: number, rules: Record<string, number>): Line | null {
  if (!date || !inChristmas(date)) return null;
  if (job && job !== "oil_change" && job !== "seasonal") return null;
  const off = Number(rules.christmas_discount ?? 10);
  if (!(off > 0)) return null;
  const n = Math.max(1, Math.floor(cars || 1));
  return { label: `Christmas discount${n > 1 ? ` × ${n}` : ""}`, amount: -r2(off * n) };   // ends in "discount": a plan-covered visit drops it
}

/** Add lines (before travel, which stays last) and work the totals out again. Never below $0. */
export function addLines<T extends Priced>(q: T, extra: Line[], hstRate: number): T {
  if (!extra.length) return q;
  const lines = [...q.lines];
  const at = lines.findIndex((l) => /^Travel/.test(l.label));
  lines.splice(at < 0 ? lines.length : at, 0, ...extra);
  const before = q.lines.reduce((t, l) => t + l.amount, 0);
  const subtotal = r2(Math.max(0, lines.reduce((t, l) => t + l.amount, 0)));
  const hst = r2(subtotal * hstRate);
  const off = r2(before - subtotal);
  return { ...q, lines, subtotal, hst, total: r2(subtotal + hst), ...(q.profit != null ? { profit: r2(q.profit - off) } : {}) };
}

/** How much of the customer's credits to use on a booking: oldest first, never more than the booking costs. */
export function pickCredits(credits: { id: string; amount: number }[], subtotal: number) {
  const used: { id: string; amount: number }[] = [];
  let left = r2(subtotal);
  for (const c of credits) {
    if (left <= 0) break;
    if (Number(c.amount) > left) break;   // a credit is used whole, never split
    used.push(c); left = r2(left - Number(c.amount));
  }
  return { used, total: r2(used.reduce((t, c) => t + Number(c.amount), 0)) };
}

/** A short referral code from their first name: "mathew" + 3 letters/numbers. */
export function makeRefCode(firstName: string | null | undefined, rand: () => number = Math.random) {
  const base = (firstName || "friend").toLowerCase().normalize("NFD").replace(/[^a-z]/g, "").slice(0, 10) || "friend";
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  return base + Array.from({ length: 3 }, () => abc[Math.floor(rand() * abc.length)]).join("");
}

/** A booking moved to another day: add the Christmas line if it moved into Dec 1 to Jan 1, take it off if it moved out.
 *  Returns the new price, or null when nothing changes. */
export function repriceForDate<T extends Priced>(q: T | null | undefined, date: string, job: string | undefined, cars: number, rules: Record<string, number>, hstRate: number): T | null {
  if (!q?.lines?.length) return null;
  const has = q.lines.some((l) => /^Christmas discount/.test(l.label));
  const want = christmasLine(date, job, cars, rules);
  if (!!want === has) return null;
  if (want) return addLines(q, [want], hstRate);
  const lines = q.lines.filter((l) => !/^Christmas discount/.test(l.label));
  const removed = q.lines.filter((l) => /^Christmas discount/.test(l.label)).reduce((t, l) => t + l.amount, 0);
  const subtotal = r2(Math.max(0, lines.reduce((t, l) => t + l.amount, 0)));
  const hst = r2(subtotal * hstRate);
  return { ...q, lines, subtotal, hst, total: r2(subtotal + hst), ...(q.profit != null ? { profit: r2(q.profit - removed) } : {}) };
}
