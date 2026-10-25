import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPlan, oilLeft, planDates } from "../plan-cover.ts";

test("plan visit: oil change covered, wiper labour free, parts and travel still charged", () => {
  const r = applyPlan([{ label: "Full synthetic oil change (0W-20, 4.4 L)", amount: 90 }, { label: "Wiper blades", amount: 37 }, { label: "Washer fluid top-up", amount: 5 }, { label: "Travel (34 km)", amount: 20 }],
    { oilLeft: true, swapLeft: false, hstRate: 0.14 });
  assert.deepEqual(r.lines.map((l) => l.amount), [0, 22, 0, 20]);
  assert.equal(r.total, 47.88);
});

test("used up this month: normal price, but filter labour is still free", () => {
  const r = applyPlan([{ label: "Full synthetic oil change (0W-20, 4.4 L)", amount: 90 }, { label: "Cabin air filter", amount: 32 }], { oilLeft: false, swapLeft: false, hstRate: 0.14 });
  assert.deepEqual(r.lines.map((l) => l.amount), [90, 22]);
});

test("seasonal: swap covered, package discount dropped", () => {
  const r = applyPlan([{ label: "Full synthetic oil change (0W-20, 4.4 L)", amount: 110 }, { label: "Tire change (on rims)", amount: 90 }, { label: "Seasonal package discount", amount: -15 }],
    { oilLeft: true, swapLeft: true, hstRate: 0.14 });
  assert.equal(r.total, 0);
});

test("one a month, and only the year's visits", () => {
  assert.equal(oilLeft({ visits: 6, usedTotal: 2, usedThisMonth: 0 }), true);
  assert.equal(oilLeft({ visits: 6, usedTotal: 2, usedThisMonth: 1 }), false);
  assert.equal(oilLeft({ visits: 6, usedTotal: 6, usedThisMonth: 0 }), false);
  assert.deepEqual(planDates("2026-10-31"), { starts: "2026-10-31", ends: "2027-10-31", billDay: 28 });
});
