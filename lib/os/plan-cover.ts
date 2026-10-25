// What a maintenance plan covers on a visit (no database, so tests can run it).
// Covered: the oil change itself, on-rim swaps they have left, filter and wiper labour (parts still charged), small top-ups.
const r2 = (n: number) => Math.round(n * 100) / 100;
type Line = { label: string; amount: number };

export function applyPlan(lines: Line[], o: { oilLeft: boolean; swapLeft: boolean; hstRate: number; wiperLabour?: number; filterLabour?: number }) {
  const out: Line[] = [];
  const wiper = o.wiperLabour ?? 15, filter = o.filterLabour ?? 10;
  let oilCovered = false;
  for (const l of lines) {
    if (/^(Full synthetic oil change|Diesel oil change)/.test(l.label) && o.oilLeft) { out.push({ label: "Oil change, covered by your plan", amount: 0 }); oilCovered = true; continue; }
    if (/^Tire change/.test(l.label) && o.swapLeft) { out.push({ label: "Tire change, covered by your plan", amount: 0 }); continue; }
    if (/discount$/i.test(l.label) && (oilCovered || o.swapLeft)) continue;    // the package discount doesn't stack with the plan
    if (/^Wiper blades/.test(l.label)) { out.push({ label: "Wiper blades (labour free on your plan)", amount: r2(Math.max(0, l.amount - wiper)) }); continue; }
    if (/^(Cabin|Engine) air filter/.test(l.label)) { out.push({ label: `${l.label} (labour free on your plan)`, amount: r2(Math.max(0, l.amount - filter)) }); continue; }
    if (/top-up$/i.test(l.label)) { out.push({ label: `${l.label}, included in your plan`, amount: 0 }); continue; }
    out.push(l);
  }
  const subtotal = r2(out.reduce((t, l) => t + l.amount, 0));
  const hst = r2(subtotal * o.hstRate);
  return { lines: out, subtotal, hst, total: r2(subtotal + hst), oilCovered };
}

/** Up to one oil change a month, and no more than the plan's visits for the year. */
export function oilLeft(p: { visits: number; usedTotal: number; usedThisMonth: number }) {
  return p.usedTotal < p.visits && p.usedThisMonth < 1;
}

const addMonths = (iso: string, m: number) => { const [y, mo, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, mo - 1 + m, d)).toISOString().slice(0, 10); };
/** Plan year from the day they agree: 12 monthly bills, billed on the same day each month (capped at the 28th). */
export function planDates(today: string) {
  const day = Math.min(28, Number(today.slice(8, 10)));
  return { starts: today, ends: addMonths(today, 12), billDay: day };
}
export const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
