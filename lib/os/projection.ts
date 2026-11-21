// Money projection: this week, month and year, and the next ones.
// Days already past this year use what actually happened. Days still to come use last year's pace for that month,
// scaled by how this year is running against last year over the same days (clamped, and only with enough history).
// Next year uses this year's pattern, scaled by the same ratio once more.
const r2 = (n: number) => Math.round(n * 100) / 100;
const utc = (s: string) => new Date(`${s}T12:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => { const d = utc(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0, 12)).getUTCDate();
const clampDay = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(Math.min(d, daysIn(y, m))).padStart(2, "0")}`;

/** A real finished job (not a cancellation fee or plan payment), with its Halifax day and what it sold for. */
export type PJob = { day: string; revenue: number };
export type ProjPeriod = { label: string; from: string; to: string; jobs: number; sales: number; profit: number; current: boolean };
export type Projection = { growth: number; avgSale: number; perJob: number; fixedMonthly: number; note: string; periods: Record<"week" | "month" | "year" | "nextWeek" | "nextMonth" | "nextYear", ProjPeriod> };

export function project(o: { today: string; jobs: PJob[]; perJob: number; fixedMonthly: number }): Projection {
  const { today, jobs } = o;
  const Y = +today.slice(0, 4), M = +today.slice(5, 7), D = +today.slice(8, 10), L = Y - 1;
  const byDay = new Map<string, number>();
  for (const j of jobs) byDay.set(j.day, (byDay.get(j.day) ?? 0) + 1);
  const count = (from: string, to: string) => { let n = 0; for (let d = from; d <= to; d = addDays(d, 1)) n += byDay.get(d) ?? 0; return n; };

  // how this year is running against last year, over the same days
  const thisYtd = count(`${Y}-01-01`, today);
  const lastYtd = count(`${L}-01-01`, clampDay(L, M, D));
  const growth = lastYtd >= 10 && thisYtd > 0 ? Math.min(2, Math.max(0.5, thisYtd / lastYtd)) : 1;

  // typical job price and jobs a day, from the last 90 days (all jobs if that's empty)
  const from90 = addDays(today, -89);
  const recent = jobs.filter((j) => j.day >= from90 && j.day <= today);
  const pool = recent.length ? recent : jobs;
  const avgSale = pool.length ? r2(pool.reduce((t, j) => t + Number(j.revenue || 0), 0) / pool.length) : 0;
  const dailyRecent = recent.length / 90;

  // a day's jobs: the actual count for days already past this year, otherwise last year's pace for that month
  const seasonal = (m: number) => { const n = count(`${L}-${String(m).padStart(2, "0")}-01`, `${L}-${String(m).padStart(2, "0")}-${daysIn(L, m)}`); return n > 0 ? n / daysIn(L, m) : dailyRecent; };
  const rate = (day: string) => {
    const y = +day.slice(0, 4), m = +day.slice(5, 7);
    if (y === Y && day <= today) return byDay.get(day) ?? 0;
    if (y === Y) return seasonal(m) * growth;
    return seasonal(m) * growth * growth;   // next year: this year's pattern, once more
  };
  const jobsFor = (from: string, to: string) => { let n = 0; for (let d = from; d <= to; d = addDays(d, 1)) n += rate(d); return r2(n); };

  const period = (label: string, from: string, to: string, current: boolean): ProjPeriod => {
    const days = Math.round((utc(to).getTime() - utc(from).getTime()) / 86400000) + 1;
    const n = jobsFor(from, to);
    const fixed = o.fixedMonthly * 12 * days / 365;
    return { label, from, to, jobs: n, sales: r2(n * avgSale), profit: r2(n * o.perJob - fixed), current };
  };

  const monday = (d: string) => addDays(d, -((utc(d).getUTCDay() + 6) % 7));
  const thisMon = monday(today), nextMon = addDays(thisMon, 7);
  const nextMonthStart = M === 12 ? `${Y + 1}-01-01` : `${Y}-${String(M + 1).padStart(2, "0")}-01`;
  const nextMonthEnd = M === 12 ? `${Y + 1}-01-31` : clampDay(Y, M + 1, 31);
  return {
    growth: r2(growth), avgSale, perJob: o.perJob, fixedMonthly: o.fixedMonthly,
    note: lastYtd >= 10 ? `Last year's pace for each month, ${r2(growth)}x this year so far (${thisYtd} jobs vs ${lastYtd} last year, same days).` : "Not enough last year history yet, so it uses the last 90 days' pace.",
    periods: {
      week: period("This week", thisMon, addDays(thisMon, 6), true),
      month: period("This month", `${Y}-${String(M).padStart(2, "0")}-01`, clampDay(Y, M, 31), true),
      year: period("This year", `${Y}-01-01`, `${Y}-12-31`, true),
      nextWeek: period("Next week", nextMon, addDays(nextMon, 6), false),
      nextMonth: period("Next month", nextMonthStart, nextMonthEnd, false),
      nextYear: period("Next year", `${Y + 1}-01-01`, `${Y + 1}-12-31`, false),
    },
  };
}
