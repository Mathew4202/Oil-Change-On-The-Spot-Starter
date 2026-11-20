// Loads hours, bookings, time off and holidays, then asks slots.ts what is free.
import { sbGet } from "@/lib/os/db";
import { DEFAULT_WINDOWS, type SeasonWindow } from "@/lib/os/seasons";
import { slotsForDay, halifaxToDate, driveMin, DEFAULT_SLOT_RULES, type Hours, type Busy } from "@/lib/os/slots";
import { geocode } from "@/lib/os/geo";

const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

export type DayOpts = { cars?: number; filterInStock?: boolean; now?: Date; minutes?: number; ignoreBookingId?: string; ignoreBookingIds?: string[]; ignoreHoldToken?: string; fleet?: boolean; address?: string | null };

/** Everything that holds time on a day: visits (with where they are), time off and holds for callers. */
async function dayBusy(date: string, opts: DayOpts) {
  const from = halifaxToDate(date, 0).toISOString();
  const to = halifaxToDate(date, 26 * 60).toISOString();   // covers late jobs running past midnight
  const [hours, bookings, off, closed, rules, holds] = await Promise.all([
    sbGet<{ dow: number; first_start: string; last_start: string }>("business_hours?select=dow,first_start,last_start"),
    sbGet<{ starts_at: string; ends_at: string; address: string | null }>(
      `bookings?select=starts_at,ends_at,address&status=in.(requested,confirmed,in_progress)&starts_at=lt.${to}&ends_at=gt.${from}${opts.ignoreBookingId ? `&id=neq.${opts.ignoreBookingId}` : ""}${opts.ignoreBookingIds?.length ? `&id=not.in.(${opts.ignoreBookingIds.join(",")})` : ""}`),
    sbGet<{ starts_at: string; ends_at: string }>(`time_off?select=starts_at,ends_at&starts_at=lt.${to}&ends_at=gt.${from}`),
    sbGet<{ day: string }>(`parts_closed_days?select=day&day=eq.${date}`),
    sbGet<{ key: string; value: number }>("pricing_rules?select=key,value"),
    // times held for a caller (until the hold runs out)
    sbGet<{ starts_at: string; ends_at: string }>(`slot_holds?select=starts_at,ends_at&status=eq.held&expires_at=gt.${new Date().toISOString()}&starts_at=lt.${to}&ends_at=gt.${from}${opts.ignoreHoldToken ? `&token=neq.${encodeURIComponent(opts.ignoreHoldToken)}` : ""}`).catch(() => []),
  ]);
  const r = Object.fromEntries(rules.map((x) => [x.key, Number(x.value)]));
  const h: Hours[] = hours.map((x) => ({ dow: x.dow, firstStart: toMin(x.first_start), lastStart: toMin(x.last_start) }));
  // where each visit is, so the drive to and from it can be counted (a visit with no known place counts no drive)
  const pts = await Promise.all(bookings.map((b) => geocode(b.address).catch(() => null)));
  const busy: Busy[] = [
    ...bookings.map((b, i) => ({ start: new Date(b.starts_at), end: new Date(b.ends_at), pt: pts[i] })),
    ...[...off, ...holds].map((b) => ({ start: new Date(b.starts_at), end: new Date(b.ends_at), pt: null })),
  ];
  // Fleet priority: a stretch of the morning on weekdays stays free for fleet accounts until fleet_release_hours before
  // it starts; after that anyone can book it. Fleets (their page, and HQ booking a fleet) always see it.
  const [yy, mm, dd] = date.split("-").map(Number);
  const today = h.find((x) => x.dow === new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay());
  const fw = fleetWindow(date, r, opts.now ?? new Date(), today?.firstStart);
  if (fw && !opts.fleet) busy.push({ ...fw, pt: null });
  const at = opts.address ? await geocode(opts.address).catch(() => null) : null;
  return { h, r, busy, closed, at };
}

export async function dayAvailability(date: string, opts: DayOpts = {}) {
  const { h, r, busy, closed, at } = await dayBusy(date, opts);
  return slotsForDay({
    date, now: opts.now ?? new Date(), hours: h.length ? h : undefined, busy, at,
    partsClosedDates: closed.map((c) => c.day), needsPartsRun: !opts.filterInStock, cars: opts.cars,
    rules: {
      jobMinutes: opts.minutes ?? r.job_minutes ?? DEFAULT_SLOT_RULES.jobMinutes,
      stepMinutes: r.slot_step_minutes ?? DEFAULT_SLOT_RULES.stepMinutes,
      minNoticeMinutes: r.min_notice_minutes ?? DEFAULT_SLOT_RULES.minNoticeMinutes,
      maxDaysAhead: r.max_days_ahead ?? DEFAULT_SLOT_RULES.maxDaysAhead,
    },
  });
}

/** For an owner's move to any time: the visit it would run into because of the drive before or after it, or null. */
export async function driveClash(date: string, start: Date, end: Date, address: string | null | undefined, ignoreIds: string[]) {
  const { busy, at } = await dayBusy(date, { ignoreBookingIds: ignoreIds, address });
  const hit = busy.find((b) => start.getTime() < b.end.getTime() + driveMin(b.pt, at) * 60000 && end.getTime() + driveMin(at, b.pt) * 60000 > b.start.getTime());
  return hit ? hit : null;
}

/** The time held for fleets on this day, if it's still held (null once released, on weekends, or when switched off). */
export function fleetWindow(date: string, r: Record<string, number>, now: Date, dayStart?: number): Busy | null {
  const len = r.fleet_window_minutes ?? 0;
  if (!(len > 0)) return null;
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if ((r.fleet_window_weekdays_only ?? 1) === 1 && (dow === 0 || dow === 6)) return null;
  // from the start of that day's hours, unless fleet_window_start sets a clock time (minutes after midnight)
  const startMin = (r.fleet_window_start ?? -1) >= 0 ? r.fleet_window_start : dayStart;
  if (startMin == null) return null;
  const start = halifaxToDate(date, startMin);
  if (start.getTime() - now.getTime() <= (r.fleet_release_hours ?? 48) * 3600000) return null;   // released: anyone can book it now
  return { start, end: new Date(start.getTime() + len * 60000) };
}

/** Minutes in the calendar per car for each job type (settings can override). */
export function jobMinutes(job: string | undefined, r: Record<string, number>, addons: string[] = []): number {
  if (job === "parts") return r.job_minutes_parts ?? 45;
  if (job === "diagnostic") return r.job_minutes_diagnostic ?? 60;
  if (job === "tires") return r.job_minutes_tires ?? 60;
  if (job === "rotation") return r.job_minutes_rotation ?? 60;
  if (job === "seasonal") return (r.job_minutes ?? 45) + (r.job_minutes_tires_addon ?? 45);
  // oil change, plus extra time when tires are swapped on the same visit
  return (r.job_minutes ?? 45) + (addons.includes("tires") ? r.job_minutes_tires_addon ?? 45 : 0);
}

/** Seasonal package windows from the database (falls back to the defaults). */
export async function seasonWindows(): Promise<SeasonWindow[]> {
  try {
    const rows = await sbGet<{ name: string; starts: string; ends: string }>("seasonal_windows?select=name,starts,ends");
    return rows.length ? rows.map((w) => ({ name: w.name, from: w.starts, to: w.ends })) : DEFAULT_WINDOWS;
  } catch { return DEFAULT_WINDOWS; }
}
