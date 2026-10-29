import { test } from "node:test";
import assert from "node:assert/strict";
import { lateStep, owing, lateTerms, lateRules } from "../bill-late.ts";

const rules = lateRules({});
const bill = { total: 102.6, paid: 0, lateFee: 0, lateInterest: 0, dueAt: "2026-11-03T15:00:00Z", lateLastAt: null };

test("nothing before the 48 hours are up, the late fee once after, then 2% every 30 days", () => {
  assert.equal(lateStep(bill, new Date("2026-11-03T14:00:00Z"), rules), null);
  assert.deepEqual(lateStep(bill, new Date("2026-11-03T16:00:00Z"), rules), { lateFee: 10, kind: "fee" });
  const withFee = { ...bill, lateFee: 10, lateLastAt: "2026-11-03T16:00:00Z" };
  assert.equal(lateStep(withFee, new Date("2026-11-20T00:00:00Z"), rules), null);
  assert.deepEqual(lateStep(withFee, new Date("2026-12-04T00:00:00Z"), rules), { addInterest: 2.25, kind: "interest" });   // 2% of 112.60
  assert.equal(owing({ ...withFee, lateInterest: 2.25 }), 114.85);
  assert.equal(lateStep({ ...bill, paid: 102.6 }, new Date("2026-12-04T00:00:00Z"), rules), null);   // paid: nothing added
  assert.equal(lateStep({ ...bill, dueAt: null }, new Date("2027-01-01T00:00:00Z"), rules), null);   // not a pay-later bill
});

test("the customer is told up front", () => {
  assert.equal(lateTerms(rules), "Please pay within 48 hours. After that a $10 late fee is added, then 2% interest each month on what's still owing.");
  assert.equal(lateTerms({ dueHours: 48, fee: 0, monthlyPct: 0 }), "Please pay within 48 hours.");
});
