// Loads hours, bookings, time off and holidays, then asks slots.ts what is free.
import { sbGet } from "@/lib/os/db";
import { slotsForDay, halifaxToDate, DEFAULT_SLOT_RULES, type Hours, type Busy } from "@/lib/os/slots";

const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

export async function dayAvailability(date: string, opts: { cars?: number; filterInStock?: boolean; now?: Date } = {}) {
  const from = halifaxToDate(date, 0).toISOString();
  const to = halifaxToDate(date, 26 * 60).toISOString();   // covers late jobs running past midnight
  const [hours, bookings, off, closed, rules] = await Promise.all([
    sbGet<{ dow: number; first_start: string; last_start: string }>("business_hours?select=dow,first_start,last_start"),
    sbGet<{ starts_at: string; ends_at: string }>(
      `bookings?select=starts_at,ends_at&status=in.(requested,confirmed,in_progress)&starts_at=lt.${to}&ends_at=gt.${from}`),
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
      jobMinutes: r.job_minutes ?? DEFAULT_SLOT_RULES.jobMinutes,
      stepMinutes: r.slot_step_minutes ?? DEFAULT_SLOT_RULES.stepMinutes,
      minNoticeMinutes: r.min_notice_minutes ?? DEFAULT_SLOT_RULES.minNoticeMinutes,
      maxDaysAhead: r.max_days_ahead ?? DEFAULT_SLOT_RULES.maxDaysAhead,
    },
  });
}
