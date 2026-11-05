// GET ?kind=week|month|year&offset=0 → profit and loss, HST, unpaid jobs, bank status
import { NextRequest, NextResponse } from "next/server";
import { currentOwner } from "@/lib/os/auth";
import { sbGet, sbInsert } from "@/lib/os/db";
import { halifaxDate, halifaxToDate } from "@/lib/os/slots";
import { periodFor, summarize, byMonth, groupOf, beforeHst, isRealJob, type JobRow, type ExpRow, type Period } from "@/lib/os/money";
import { moneyPerHour, dayDrives, type HourJob } from "@/lib/os/money-hour";
import { cachedPoints, geoKey, geocode } from "@/lib/os/geo";
import { bases } from "@/lib/os/maps";

export const dynamic = "force-dynamic";

const JOB_COLS = "done_at,revenue,hst,tip,cost_oil,cost_parts,cost_other,done_by,service";
const EXP_COLS = "spent_at,total,hst,subtotal,category,description";
const nextDay = (d: string) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
const jobsBetween = (from: string, to: string) =>
  sbGet<JobRow>(`jobs?select=${JOB_COLS}&done_at=gte.${halifaxToDate(from, 0).toISOString()}&done_at=lt.${halifaxToDate(nextDay(to), 0).toISOString()}`);
type HourRow = Omit<HourJob, "address" | "minutes" | "driveMin"> & { booking_id: string | null;
  bookings: { starts_at: string; ends_at: string; address: string | null } | null; customers: { address: string | null } | null };
/** Profit per hour by area, service and add-on for the period (map points only from the cache: no new lookups here). */
async function perHour(from: string, to: string) {
  const [rows, home] = await Promise.all([
    sbGet<HourRow>(`jobs?select=revenue,cost_oil,cost_parts,cost_other,service,lines,booking_id,bookings(starts_at,ends_at,address),customers(address)` +
      `&done_at=gte.${halifaxToDate(from, 0).toISOString()}&done_at=lt.${halifaxToDate(nextDay(to), 0).toISOString()}`),
    bases().then((b) => geocode(b[0])).catch(() => null),
  ]);
  const perBooking = new Map<string, number>();
  for (const r of rows) if (r.booking_id) perBooking.set(r.booking_id, (perBooking.get(r.booking_id) ?? 0) + 1);
  const addr = (r: HourRow) => r.bookings?.address || r.customers?.address || null;
  const pts = home ? await cachedPoints(rows.map(addr)) : new Map<string, { lat: number; lng: number }>();
  // each day's real driving: home, job to job, back home (one stop per booking; a multi-car visit shares its drive)
  const days = new Map<string, Map<string, { id: string; pt: { lat: number; lng: number } | null; start: number; end: number }>>();
  for (const r of rows) {
    if (!r.booking_id || !r.bookings) continue;
    const s0 = clock(r.bookings.starts_at), e0 = clock(r.bookings.ends_at);
    const d = days.get(s0.day) ?? new Map(); days.set(s0.day, d);
    const a = addr(r);
    d.set(r.booking_id, { id: r.booking_id, pt: a ? pts.get(geoKey(a)) ?? null : null, start: s0.min, end: e0.day === s0.day ? e0.min : 1440 });
  }
  const drive = new Map<string, number>();
  if (home) for (const d of days.values()) for (const [id, m] of dayDrives([...d.values()], home)) drive.set(id, m);
  return moneyPerHour(rows.map((r) => {
    const n = perBooking.get(r.booking_id ?? "") ?? 1;
    const mins = r.bookings ? (new Date(r.bookings.ends_at).getTime() - new Date(r.bookings.starts_at).getTime()) / 60000 / n : null;
    return { ...r, address: addr(r), minutes: mins, driveMin: r.booking_id && drive.has(r.booking_id) ? drive.get(r.booking_id)! / n : null };
  }));
}
/** Halifax date and clock minutes for a timestamp. */
const clock = (iso: string) => {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Halifax", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "0";
  return { day: `${g("year")}-${g("month")}-${g("day")}`, min: Number(g("hour")) * 60 + Number(g("minute")) };
};
/** This month so far: what came in vs everything spent. If we're behind, how many more jobs get us back to $0.
 *  perJob = what one more job leaves after its oil, filter, supplies and gas (last 90 days). */
const nextMonthStart = (month: string) => { const [y, m] = month.split("-").map(Number); return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`; };

async function hole(today: string) {
  const back = new Date(`${today}T12:00:00Z`); back.setUTCDate(back.getUTCDate() - 90);
  const from90 = back.toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const [recentJobs, gasExps, monthExps, monthJobs] = await Promise.all([
    sbGet<JobRow>(`jobs?select=${JOB_COLS}&done_at=gte.${from90}`),
    sbGet<ExpRow>(`expenses?select=${EXP_COLS}&spent_at=gte.${from90}`),
    sbGet<ExpRow>(`expenses?select=${EXP_COLS}&spent_at=gte.${month}-01&spent_at=lte.${today}`),
    sbGet<JobRow>(`jobs?select=${JOB_COLS}&done_at=gte.${month}-01T00:00:00-04:00`),
  ]);
  // only finished jobs count (a booking can still cancel); cancellation fees and plan payments aren't jobs
  const jobsNow = monthJobs.filter((j) => halifaxDate(new Date(j.done_at)).startsWith(month));
  const doneNow = jobsNow.filter(isRealJob).length;
  const [booked, last30] = await Promise.all([
    sbGet<{ id: string }>(`bookings?select=id&status=in.(confirmed,requested)&starts_at=gt.${new Date().toISOString()}&starts_at=lt.${nextMonthStart(month)}`).catch(() => []),
    sbGet<{ service: string | null }>(`jobs?select=service&done_at=gte.${new Date(Date.now() - 30 * 86400000).toISOString()}`).catch(() => []),
  ]);
  const recent = summarize(recentJobs, []);
  const gas = gasExps.filter((e) => groupOf(e.category, e.description) === "fuel").reduce((t, e) => t + beforeHst(e), 0);
  // Old jobs often have no oil cost (oil was bought in bulk and logged as one expense): use the typical cost of the jobs
  // that do have it, so a job doesn't look more profitable than it is
  const costed = recentJobs.filter((j) => Number(j.cost_oil ?? 0) > 0);
  const costs = costed.map((j) => Number(j.cost_oil ?? 0) + Number(j.cost_parts ?? 0) + Number(j.cost_other ?? 0)).sort((a, b) => a - b);
  const costEach = costs.length ? costs[Math.floor(costs.length / 2)] : 0;   // middle one: a two-car job doesn't skew it
  const gasPerJob = recentJobs.length ? Math.round((gas / recentJobs.length) * 100) / 100 : 0;
  const perJob = recentJobs.length ? Math.round((recent.avgJob - Math.max(costEach, recent.avgJob - recent.avgJobProfit) - gasPerJob) * 100) / 100 : 0;
  // Per job, "the right way": this month's own jobs once there are 5 finished (they're at today's prices),
  // otherwise the last 30 days. Price minus the oil and filter (typical cost if a job has none recorded) minus gas.
  const leaves = (js: JobRow[]) => {
    const real = js.filter(isRealJob);
    if (!real.length) return 0;
    const each = real.map((j) => {
      const recorded = Number(j.cost_oil ?? 0) + Number(j.cost_parts ?? 0) + Number(j.cost_other ?? 0);
      return Number(j.revenue ?? 0) - (Number(j.cost_oil ?? 0) > 0 ? recorded : Math.max(recorded, costEach));
    });
    return Math.round((each.reduce((t, x) => t + x, 0) / real.length - gasPerJob) * 100) / 100;
  };
  const thisMonthReal = jobsNow.filter(isRealJob);
  const cutoff30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const basis = thisMonthReal.length >= 5 ? "month" as const : "30days" as const;
  const perJobNow = basis === "month" ? leaves(thisMonthReal) : leaves(recentJobs.filter((j) => j.done_at >= cutoff30)) || perJob;
  const m = summarize(jobsNow, monthExps);
  const shortBy = m.profit < 0 ? Math.round(-m.profit * 100) / 100 : 0;
  const needed = shortBy > 0 && perJobNow > 0 ? Math.ceil(shortBy / perJobNow) : 0;
  const day = +today.slice(8, 10);
  const daysInMonth = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7), 0)).getUTCDate();
  // pace: finished so far + the rest of the month at the last 30 days' rate (the first few days of a month alone would overshoot)
  const perDay = last30.filter(isRealJob).length / 30;
  const onPace = doneNow + Math.round(perDay * (daysInMonth - day));
  return { sales: m.sales, spending: m.spending, profit: m.profit, shortBy, needed, perJob: perJobNow, basis, gasPerJob, jobsThisMonth: doneNow, onPace, booked: booked.length, daysLeft: daysInMonth - day, recentJobs: recentJobs.length };
}

const expBetween = (from: string, to: string) => sbGet<ExpRow>(`expenses?select=${EXP_COLS}&spent_at=gte.${from}&spent_at=lte.${to}`);

export async function GET(req: NextRequest) {
  if (!currentOwner()) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const kind = (["week", "month", "year"].includes(req.nextUrl.searchParams.get("kind") || "") ? req.nextUrl.searchParams.get("kind") : "month") as Period["kind"];
  const offset = Math.max(-60, Math.min(0, Math.trunc(Number(req.nextUrl.searchParams.get("offset")) || 0)));
  const today = halifaxDate(new Date());
  const p = periodFor(kind, offset, today);
  const year = +p.from.slice(0, 4);

  const [jobs, exps, yJobs, yExps, unpaid, needs, lastImport, hourly] = await Promise.all([
    jobsBetween(p.from, p.to), expBetween(p.from, p.to),
    kind === "year" ? Promise.resolve(null) : jobsBetween(`${year}-01-01`, `${year}-12-31`),
    kind === "year" ? Promise.resolve(null) : expBetween(`${year}-01-01`, `${year}-12-31`),
    // finished jobs not paid yet, plus same-day cancellation fees not paid yet
    sbGet<{ id: string; starts_at: string; status: string; cancel_fee: number | null; quoted_total: number | null; customer: { first_name: string | null; last_name: string | null } | null; jobs: { total: number | null }[] }>(
      "bookings?select=id,starts_at,status,cancel_fee,quoted_total,customer:customers(first_name,last_name),jobs(total)&status=in.(done,cancelled)&paid_at=is.null&or=(source.is.null,source.neq.square_import)&order=starts_at.desc&limit=40")
      .then((rows) => rows.filter((b) => b.status === "done" || Number(b.cancel_fee) > 0))
      .catch(() => sbGet<{ id: string; starts_at: string; status: string; cancel_fee: number | null; quoted_total: number | null; customer: { first_name: string | null; last_name: string | null } | null; jobs: { total: number | null }[] }>(
        "bookings?select=id,starts_at,status,quoted_total,customer:customers(first_name,last_name),jobs(total)&status=eq.done&paid_at=is.null&or=(source.is.null,source.neq.square_import)&order=starts_at.desc&limit=30")),
    sbGet<{ id: string }>("bank_lines?select=id&status=eq.needs_look").catch(() => []),
    sbGet<{ to_date: string; account: string }>("bank_imports?select=to_date,account&order=to_date.desc&limit=1").catch(() => []),
    perHour(p.from, p.to).catch(() => null),
  ]);
  const holeNow = await hole(today).catch(() => null);

  return NextResponse.json({
    period: p,
    summary: summarize(jobs, exps),
    months: byMonth(year, yJobs ?? jobs, yExps ?? exps, (ts) => halifaxDate(new Date(ts))),
    unpaid: unpaid.map((b) => ({ id: b.id, date: halifaxDate(new Date(b.starts_at)), name: [b.customer?.first_name, b.customer?.last_name].filter(Boolean).join(" ") || "Customer",
      amount: Number(b.jobs?.[0]?.total ?? b.quoted_total ?? 0), fee: b.status === "cancelled" })),
    hourly,
    hole: holeNow,
    bank: { needsLook: needs.length, lastStatement: lastImport[0]?.to_date ?? null, today },
  });
}

/** Owners: the numbers behind "jobs a month to get out of the hole": fixed costs a month, months to pay it back, and what's owed (blank = HQ works it out). */
export async function POST(req: NextRequest) {
  if (!currentOwner()) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const set: [string, number, string][] = [];
  if (b.fixed !== undefined) { const v = Number(b.fixed); if (!(v >= 0 && v < 100000)) return NextResponse.json({ error: "Check the monthly costs" }, { status: 400 }); set.push(["fixed_monthly", Math.round(v), "fixed costs a month (Money: out of the hole)"]); }
  if (b.months !== undefined) { const v = Math.round(Number(b.months)); if (!(v >= 1 && v <= 36)) return NextResponse.json({ error: "Pick 1 to 36 months" }, { status: 400 }); set.push(["payoff_months", v, "months to pay back what we're behind"]); }
  if (b.owed !== undefined) { const v = b.owed === null || b.owed === "" ? -1 : Number(b.owed); if (!(v >= -1 && v < 1000000)) return NextResponse.json({ error: "Check the amount owed" }, { status: 400 }); set.push(["owed_override", v, "what we owe (-1 = work it out from HQ)"]); }
  for (const [key, value, note] of set) {
    const r = await sbInsert("pricing_rules", { key, value, note }, { upsertOn: "key" });
    if (!r.ok) return NextResponse.json({ error: "Couldn't save" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
