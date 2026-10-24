// Profit and loss for a week / month / year. Pure functions (tested in __tests__/money.test.ts).

export type JobRow = { done_at: string; revenue: number | null; hst: number | null; cost_oil: number | null; cost_parts: number | null; cost_other: number | null; done_by: string | null };
export type ExpRow = { spent_at: string; total: number; hst: number | null; subtotal: number | null; category: string | null; description?: string | null };
export type Period = { kind: "week" | "month" | "year"; from: string; to: string; label: string; offset: number };

const r2 = (n: number) => Math.round(n * 100) / 100;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (s: string) => new Date(`${s}T12:00:00Z`);

/** today = Halifax date YYYY-MM-DD. offset 0 = this week/month/year, -1 = the one before. */
export function periodFor(kind: Period["kind"], offset: number, today: string): Period {
  const t = utc(today);
  if (kind === "week") {
    const monday = new Date(t); monday.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) + offset * 7);
    const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6);
    const f = (d: Date) => `${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}`;
    return { kind, offset, from: iso(monday), to: iso(sunday), label: offset === 0 ? "This week" : offset === -1 ? "Last week" : `${f(monday)} to ${f(sunday)}` };
  }
  if (kind === "month") {
    const first = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + offset, 1, 12));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0, 12));
    return { kind, offset, from: iso(first), to: iso(last), label: `${MONTHS[first.getUTCMonth()]} ${first.getUTCFullYear()}` };
  }
  const y = t.getUTCFullYear() + offset;
  return { kind, offset, from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) };
}

export const GROUPS: [string, string, RegExp][] = [
  ["oil", "Oil", /^oil$/],
  ["parts", "Filters and parts", /filter|wiper|battery|fluid|part/],
  ["fuel", "Gas", /fuel|gas/],
  ["supplies", "Supplies and tools", /suppl|tool|equip/],
  ["software", "Phone and software", /software|phone|subscri|app|web/],
  ["insurance", "Insurance", /insur/],
  ["fees", "Bank and card fees", /fee/],
  ["marketing", "Marketing", /market|ads?$|advert|print|flyer/],
];
// Old Expense Tracker rows are often just "other", so the description decides ("Google ad" → Marketing)
const FROM_TEXT: [RegExp, string][] = [
  [/\bads?\b|advert|flyer|sponsor|marketing|promo/i, "marketing"], [/\bfees?\b|charge\b|elavon|square pay/i, "fees"],
  [/insur/i, "insurance"], [/\bgas\b|fuel|irving|esso|petro|shell/i, "fuel"], [/\boil\b/i, "oil"], [/filter|wiper|battery|part/i, "parts"],
  [/tool|socket|sckt|wrench|jack|ramp|drain|funnel|organi[sz]er|arranger/i, "supplies"], [/phone|software|app\b|website|domain|subscri/i, "software"],
];
export const groupOf = (category: string | null, description?: string | null) => {
  const c = (category || "").toLowerCase();
  const g = GROUPS.find(([, , re]) => re.test(c))?.[0];
  if (g) return g;
  return FROM_TEXT.find(([re]) => re.test(description || ""))?.[1] ?? "other";
};
export const groupName = (g: string) => GROUPS.find(([k]) => k === g)?.[1] ?? "Other";

/** Spending before HST. Old Expense Tracker rows only have a total, so that's used as-is. */
export const beforeHst = (e: ExpRow) => r2(e.subtotal != null ? Number(e.subtotal) : Number(e.total) - Number(e.hst ?? 0));

export function summarize(jobs: JobRow[], expenses: ExpRow[]) {
  const sales = r2(jobs.reduce((t, j) => t + Number(j.revenue ?? 0), 0));
  const hstCollected = r2(jobs.reduce((t, j) => t + Number(j.hst ?? 0), 0));
  const partsUsed = r2(jobs.reduce((t, j) => t + Number(j.cost_oil ?? 0) + Number(j.cost_parts ?? 0) + Number(j.cost_other ?? 0), 0));
  const spending = r2(expenses.reduce((t, e) => t + beforeHst(e), 0));
  const hstPaid = r2(expenses.reduce((t, e) => t + Number(e.hst ?? 0), 0));
  const cats = new Map<string, number>();
  for (const e of expenses) { const g = groupOf(e.category, e.description); cats.set(g, r2((cats.get(g) ?? 0) + beforeHst(e))); }
  const people = { mathew: 0, harsh: 0, both: 0 } as Record<string, number>;
  for (const j of jobs) { const k = (j.done_by || "both").toLowerCase(); people[k in people ? k : "both"]++; }
  return {
    jobs: jobs.length, sales, hstCollected, spending, hstPaid,
    profit: r2(sales - spending),
    hstOwing: r2(hstCollected - hstPaid),
    avgJob: jobs.length ? r2(sales / jobs.length) : 0,
    jobProfit: r2(sales - partsUsed),                         // what the jobs made after the oil and parts they used
    avgJobProfit: jobs.length ? r2((sales - partsUsed) / jobs.length) : 0,
    spendingByGroup: [...cats.entries()].map(([group, amount]) => ({ group, name: groupName(group), amount })).sort((a, b) => b.amount - a.amount),
    doneBy: people,
    jobsNoHst: jobs.filter((j) => j.hst == null).length,           // old Job Tracker jobs: HST wasn't recorded
    expensesNoHst: expenses.filter((e) => e.hst == null).length,
  };
}

/** Sales vs spending for each month of a year (for the little chart). halifaxDay turns a timestamp into YYYY-MM-DD. */
export function byMonth(year: number, jobs: JobRow[], expenses: ExpRow[], halifaxDay: (ts: string) => string) {
  const rows = MONTHS.map((m) => ({ month: m.slice(0, 3), sales: 0, spending: 0, profit: 0 }));
  for (const j of jobs) { const d = halifaxDay(j.done_at); if (+d.slice(0, 4) === year) rows[+d.slice(5, 7) - 1].sales += Number(j.revenue ?? 0); }
  for (const e of expenses) if (+e.spent_at.slice(0, 4) === year) rows[+e.spent_at.slice(5, 7) - 1].spending += beforeHst(e);
  return rows.map((r) => ({ ...r, sales: r2(r.sales), spending: r2(r.spending), profit: r2(r.sales - r.spending) }));
}
