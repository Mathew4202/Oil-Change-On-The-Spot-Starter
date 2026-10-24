import { test } from "node:test";
import assert from "node:assert/strict";
import { planPrice } from "../plan.ts";

test("matches the offers in the business plan doc", () => {
  // Andrew: 2020 Kona (SUV $110, good profit), about monthly → $105/month; with on-rim swaps ($90 each) → $120
  assert.equal(planPrice({ regular: 110, profit: 75, visits: 12, swaps: 0, swapPrice: 90 }).monthly, 105);
  assert.equal(planPrice({ regular: 110, profit: 75, visits: 12, swaps: 2, swapPrice: 90 }).monthly, 120);
  // Vantez: 2006 Civic $90, every 5 weeks → 10 x $85 / 12
  assert.equal(planPrice({ regular: 90, profit: 66, visits: 10, swaps: 0, swapPrice: 80 }).monthly, 70.83);
  // Quamari: 2013 Maxima, profit at $90 only about $47 → no discount, 6 x $90 / 12
  const q = planPrice({ regular: 90, profit: 47, visits: 6, swaps: 0, swapPrice: 80 });
  assert.equal(q.monthly, 45); assert.equal(q.discount, 0);
});

test("discount only when profit stays at or above $60 after it", () => {
  assert.equal(planPrice({ regular: 100, profit: 65, visits: 4, swaps: 0, swapPrice: 80 }).discount, 5);
  assert.equal(planPrice({ regular: 100, profit: 64.99, visits: 4, swaps: 0, swapPrice: 80 }).discount, 0);
  assert.equal(planPrice({ regular: 100, profit: null, visits: 4, swaps: 0, swapPrice: 80 }).discount, 0);
  const p = planPrice({ regular: 110, profit: 75, visits: 12, swaps: 0, swapPrice: 90 });
  assert.equal(p.hst, 14.7); assert.equal(p.monthlyWithHst, 119.7); assert.equal(p.savedPerYear, 60);
});
