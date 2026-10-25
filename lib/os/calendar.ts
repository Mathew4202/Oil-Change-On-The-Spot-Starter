// Loads hours, bookings, time off and holidays, then asks slots.ts what is free.
import { sbGet } from "@/lib/os/db";
import { DEFAULT_WINDOWS, type SeasonWindow } from "@/lib/os/seasons";
import { slotsForDay, halifaxToDate, DEFAULT_SLOT_RULES, type Hours, type Busy } from "@/lib/os/slots";

const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

export async function dayAvailability(date: string, opts: { cars?: number; filterInStock?: boolean; now?: Date; minutes?: number; ignoreBookingId?: string; ignoreBookingIds?: string[] } = {}) {
  const from = halifaxToDate(date, 0).toISOString();
  const to = halifaxToDate(date, 26 * 60).toISOString();   // covers late jobs running past midnight
  const [hours, bookings, off, closed, rules] = await Promise.all([
    sbGet<{ dow: number; first_start: string; last_start: string }>("business_hours?select=dow,first_start,last_start"),
    sbGet<{ starts_at: string; ends_at: string }>(
      `bookings?select=starts_at,ends_at&status=in.(requested,confirmed,in_progress)&starts_at=lt.${to}&ends_at=gt.${from}${opts.ignoreBookingId ? `&id=neq.${opts.ignoreBookingId}` : ""}${opts.ignoreBookingIds?.length ? `&id=not.in.(${opts.ignoreBookingIds.join(",")})` : ""}`),
    sbGet<{ starts_at: string; ends_at: string }>(`time_off?select=starts_at,ends_at&starts_at=lt.${to}&ends_at=gt.${from}`),
    sbGet<{ day: string }>(`parts_closed_days?select=day&day=eq.${date}`),
    sbGet<{ key: string; value: number }>("pricing_rules?select=key,value"),
  ]);
  const r = Object.fromEntries(rules.map((x) => [x.key, Number(x.value)]));
  const busy: Busy[] = [...bookings, ...off].map((b) => ({ start: new Date(b.starts_at), end: new Date(b.ends_at) }));
  const h: Hours[] = hours.map((x) => ({ dow: x.dow, firstStart: toMin(x.first_start), lastStart: toMin(x.last_start) }));
  return slotsForDay({
    date, now: opts.now ?? new Date(), hours: h.length ? h : undefined, busy,
    partsClosedDates: closed.map((c) => c.day), needsPartsRun: !opts.filterInStock, cars: opts.cars,
    rules: {
      jobMinutes: opts.minutes ?? r.job_minutes ?? DEFAULT_SLOT_RULES.jobMinutes,
      stepMinutes: r.slot_step_minutes ?? DEFAULT_SLOT_RULES.stepMinutes,
      minNoticeMinutes: r.min_notice_minutes ?? DEFAULT_SLOT_RULES.minNoticeMinutes,
      maxDaysAhead: r.max_days_ahead ?? DEFAULT_SLOT_RULES.maxDaysAhead,
    },
  });
}

/** Minutes in the calendar per car for each job type (settings can override). */
export function jobMinutes(job: string | undefined, r: Record<string, number>, addons: string[] = []): number {
  if (job === "parts") return r.job_minutes_parts ?? 45;
  if (job === "diagnostic") return r.job_minutes_diagnostic ?? 60;
  if (job === "tires") return r.job_minutes_tires ?? 60;
  if (job === "rotation") return r.job_minutes_rotation ?? 60;
  if (job === "seasonal") return (r.job_minutes ?? 75) + (r.job_minutes_tires_addon ?? 45);
  // oil change, plus extra time when tires are swapped on the same visit
  return (r.job_minutes ?? 75) + (addons.includes("tires") ? r.job_minutes_tires_addon ?? 45 : 0);
}

/** Seasonal package windows from the database (falls back to the defaults). */
export async function seasonWindows(): Promise<SeasonWindow[]> {
  try {
    const rows = await sbGet<{ name: string; starts: string; ends: string }>("seasonal_windows?select=name,starts,ends");
    return rows.length ? rows.map((w) => ({ name: w.name, from: w.starts, to: w.ends })) : DEFAULT_WINDOWS;
  } catch { return DEFAULT_WINDOWS; }
}
