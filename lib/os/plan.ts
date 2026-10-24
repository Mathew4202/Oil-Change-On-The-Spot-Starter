// Maintenance plan price (Phase 4 decision). Pure maths, tested in __tests__/plan.test.ts.
//  • Count the oil changes needed in 12 months (up to one a month).
//  • Plan price per visit = regular price minus $5, but only if profit per visit stays at or above the $60 target.
//    If the regular price only clears the floor, no discount: the perk is free filter and wiper labour.
//  • On-rim seasonal swaps (winter tires already on their own rims) can be added at the regular swap price.
//  • Monthly = year total / 12, plus HST. 12-month plan billed monthly.
export const PLAN_DISCOUNT = 5, PLAN_PROFIT_TARGET = 60;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function planPrice(o: { regular: number; profit: number | null; visits: number; swaps: number; swapPrice: number; hstRate?: number }) {
  const visits = Math.max(1, Math.min(12, Math.round(o.visits)));
  const swaps = Math.max(0, Math.min(2, Math.round(o.swaps)));
  const discount = o.profit != null && o.profit - PLAN_DISCOUNT >= PLAN_PROFIT_TARGET ? PLAN_DISCOUNT : 0;
  const perVisit = r2(o.regular - discount);
  const year = r2(visits * perVisit + swaps * o.swapPrice);
  const monthly = r2(year / 12);
  const hst = r2(monthly * (o.hstRate ?? 0.14));
  return { visits, swaps, perVisit, discount, swapPrice: o.swapPrice, year, monthly, hst, monthlyWithHst: r2(monthly + hst),
    savedPerYear: r2(visits * discount) };
}

// How often they need an oil change → visits in a year
export const FREQUENCIES: [number, string][] = [[12, "About every month"], [10, "Every 5 to 6 weeks"], [8, "Every 6 to 7 weeks"], [6, "Every 2 months"], [4, "Every 3 months"]];
