import { test } from "node:test";
import assert from "node:assert/strict";
import { inChristmas, christmasLine, addLines, pickCredits, makeRefCode } from "../deals.ts";

test("Christmas deal runs Dec 1 to Jan 1 every year", () => {
  assert.equal(inChristmas("2026-11-30"), false);
  assert.equal(inChristmas("2026-12-01"), true);
  assert.equal(inChristmas("2026-12-31"), true);
  assert.equal(inChristmas("2027-01-01"), true);
  assert.equal(inChristmas("2027-01-02"), false);
  assert.equal(inChristmas("2030-12-15"), true);
});

test("Christmas line: oil changes only, per car, setting can change it", () => {
  assert.deepEqual(christmasLine("2026-12-10", "oil_change", 1, {}), { label: "Christmas discount", amount: -10 });
  assert.deepEqual(christmasLine("2026-12-10", "seasonal", 2, { christmas_discount: 15 }), { label: "Christmas discount × 2", amount: -30 });
  assert.equal(christmasLine("2026-12-10", "diagnostic", 1, {}), null);
  assert.equal(christmasLine("2026-11-10", "oil_change", 1, {}), null);
  assert.equal(christmasLine("2026-12-10", "oil_change", 1, { christmas_discount: 0 }), null);
});

test("lines go before travel, totals redone, never below zero", () => {
  const q = { lines: [{ label: "Full synthetic oil change", amount: 90 }, { label: "Travel (35 km)", amount: 10 }], subtotal: 100, hst: 14, total: 114, profit: 50 };
  const out = addLines(q, [{ label: "Christmas discount", amount: -10 }], 0.14);
  assert.deepEqual(out.lines.map((l) => l.label), ["Full synthetic oil change", "Christmas discount", "Travel (35 km)"]);
  assert.equal(out.subtotal, 90); assert.equal(out.hst, 12.6); assert.equal(out.total, 102.6); assert.equal(out.profit, 40);
  assert.equal(addLines(q, [{ label: "x", amount: -500 }], 0.14).total, 0);
});

test("credits used whole, oldest first, never more than the bill", () => {
  assert.deepEqual(pickCredits([{ id: "a", amount: 5 }, { id: "b", amount: 5 }], 90).used.map((c) => c.id), ["a", "b"]);
  assert.equal(pickCredits([{ id: "a", amount: 5 }], 3).total, 0);
  assert.equal(pickCredits([], 90).total, 0);
});

test("referral codes", () => {
  assert.match(makeRefCode("Mathew"), /^mathew[a-z2-9]{3}$/);
  assert.match(makeRefCode("José-Luis"), /^joseluis[a-z2-9]{3}$/);
  assert.match(makeRefCode(null), /^friend[a-z2-9]{3}$/);
});

test("moving a booking into or out of the Christmas window fixes the price", async () => {
  const { repriceForDate } = await import("../deals.ts");
  const base = { lines: [{ label: "Full synthetic oil change", amount: 90 }], subtotal: 90, hst: 12.6, total: 102.6, profit: 50 };
  const inn = repriceForDate(base, "2026-12-03", "oil_change", 1, {}, 0.14)!;
  assert.equal(inn.total, 91.2); assert.equal(inn.profit, 40);
  assert.equal(repriceForDate(inn, "2026-12-20", "oil_change", 1, {}, 0.14), null);   // still in: unchanged
  const out = repriceForDate(inn, "2027-01-05", "oil_change", 1, {}, 0.14)!;
  assert.equal(out.total, 102.6); assert.equal(out.profit, 50);
  assert.equal(repriceForDate(base, "2026-12-03", "tires", 1, {}, 0.14), null);
});
