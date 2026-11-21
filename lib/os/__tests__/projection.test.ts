import { test } from "node:test";
import assert from "node:assert/strict";
import { project, type PJob } from "../projection.ts";

// 2 jobs a day, every day of last year and this year up to the 20th, $100 each
function jobsEvery(from: string, to: string, perDay: number): PJob[] {
  const out: PJob[] = [];
  for (let d = new Date(`${from}T12:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.toISOString().slice(0, 10);
    for (let i = 0; i < perDay; i++) out.push({ day, revenue: 100 });
  }
  return out;
}

test("this year's past days are actual; the rest of the year follows last year's pace", () => {
  const jobs = [...jobsEvery("2025-01-01", "2025-12-31", 2), ...jobsEvery("2026-01-01", "2026-11-20", 2)];
  const p = project({ today: "2026-11-20", jobs, perJob: 40, fixedMonthly: 0 });
  assert.equal(p.growth, 1);                       // same pace as last year
  assert.equal(p.periods.year.jobs, 730);          // 365 days x 2 jobs
  assert.equal(p.periods.month.jobs, 60);          // 30 days x 2 jobs in November
  assert.equal(p.periods.nextMonth.jobs, 62);      // December: 31 x 2
});

test("a busier year scales the rest of this year and next year up", () => {
  const jobs = [...jobsEvery("2025-01-01", "2025-12-31", 1), ...jobsEvery("2026-01-01", "2026-11-20", 2)];
  const p = project({ today: "2026-11-20", jobs, perJob: 40, fixedMonthly: 0 });
  assert.equal(p.growth, 2);                       // capped at 2x
  assert.ok(p.periods.nextYear.jobs > p.periods.year.jobs);
});

test("profit is jobs x profit per job, less fixed costs prorated", () => {
  const jobs = jobsEvery("2025-01-01", "2025-12-31", 2);
  const p = project({ today: "2026-11-20", jobs, perJob: 40, fixedMonthly: 1000 });
  const m = p.periods.nextMonth;
  assert.equal(m.profit, Math.round((m.jobs * 40 - 1000 * 12 * 31 / 365) * 100) / 100);
});

test("no history: uses the last 90 days' pace", () => {
  const jobs = jobsEvery("2026-08-25", "2026-11-20", 1);
  const p = project({ today: "2026-11-20", jobs, perJob: 0, fixedMonthly: 0 });
  assert.equal(p.growth, 1);
  assert.match(p.note, /90 days/);
});
