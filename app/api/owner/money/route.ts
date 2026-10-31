// GET ?kind=week|month|year&offset=0 → profit and loss, HST, unpaid jobs, bank status
import { NextRequest, NextResponse } from "next/server";
import { currentOwner } from "@/lib/os/auth";
import { sbGet } from "@/lib/os/db";
import { halifaxDate, halifaxToDate } from "@/lib/os/slots";
import { periodFor, summarize, byMonth, type JobRow, type ExpRow, type Period } from "@/lib/os/money";
import { moneyPerHour, dayDrives, type HourJob } from "@/lib/os/money-hour";
import { cachedPoints, geoKey, geocode } from "@/lib/os/geo";
import { bases } from "@/lib/os/maps";

export const dynamic = "force-dynamic";

const JOB_COLS = "done_at,revenue,hst,tip,cost_oil,cost_parts,cost_other,done_by";
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

  return NextResponse.json({
    period: p,
    summary: summarize(jobs, exps),
    months: byMonth(year, yJobs ?? jobs, yExps ?? exps, (ts) => halifaxDate(new Date(ts))),
    unpaid: unpaid.map((b) => ({ id: b.id, date: halifaxDate(new Date(b.starts_at)), name: [b.customer?.first_name, b.customer?.last_name].filter(Boolean).join(" ") || "Customer",
      amount: Number(b.jobs?.[0]?.total ?? b.quoted_total ?? 0), fee: b.status === "cancelled" })),
    hourly,
    bank: { needsLook: needs.length, lastStatement: lastImport[0]?.to_date ?? null, today },
  });
}
