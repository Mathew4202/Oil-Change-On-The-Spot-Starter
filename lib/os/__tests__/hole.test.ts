import { test } from "node:test";
import assert from "node:assert/strict";
import { outOfHole } from "../money.ts";

test("jobs a month to break even and to pay back what we're behind", () => {
  const r = outOfHole({ behind: 1800, fixed: 1247, perJob: 64, months: 6, jobsThisMonth: 4, day: 4, daysInMonth: 30 });
  assert.equal(r.breakEven, 20);              // 1247 / 64 = 19.5 → 20
  assert.equal(r.perMonthPayback, 300);
  assert.equal(r.needed, 25);                 // (1247 + 300) / 64 = 24.2 → 25
  assert.equal(r.onPace, 30);
});

test("ahead of the game, or no job profit yet", () => {
  assert.equal(outOfHole({ behind: -500, fixed: 1247, perJob: 64, months: 6, jobsThisMonth: 0, day: 1, daysInMonth: 30 }).needed, 20);
  assert.equal(outOfHole({ behind: 1000, fixed: 1247, perJob: 0, months: 6, jobsThisMonth: 0, day: 1, daysInMonth: 30 }).needed, null);
});
