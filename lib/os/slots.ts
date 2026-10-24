// OCOTS OS booking slots.
// Pure functions: given the week's hours, existing bookings, time off and holidays,
// return the start times a customer can still pick. All times are Halifax time.

export const TZ = "America/Halifax";

export type Hours = { dow: number; firstStart: number; lastStart: number }; // minutes after midnight; dow 0 = Sunday
export type Busy = { start: Date; end: Date };

export type SlotRules = {
  jobMinutes: number;        // 75: 1 h 15 min per car, including travel to the next job
  stepMinutes: number;       // 30: start times offered every half hour
  minNoticeMinutes: number;  // 120: earliest start is 2 hours from now
  maxDaysAhead: number;      // 30
};

export const DEFAULT_SLOT_RULES: SlotRules = { jobMinutes: 75, stepMinutes: 30, minNoticeMinutes: 120, maxDaysAhead: 30 };

// Same hours as the current website (last start, not closing time)
export const DEFAULT_HOURS: Hours[] = [
  { dow: 0, firstStart: 13 * 60 + 30, lastStart: 22 * 60 },
  { dow: 1, firstStart: 7 * 60, lastStart: 17 * 60 },
  { dow: 2, firstStart: 12 * 60, lastStart: 16 * 60 },
  { dow: 3, firstStart: 12 * 60, lastStart: 16 * 60 },
  { dow: 4, firstStart: 12 * 60, lastStart: 16 * 60 },
  { dow: 5, firstStart: 7 * 60, lastStart: 18 * 60 },
  { dow: 6, firstStart: 10 * 60, lastStart: 22 * 60 },
];

// --- Halifax time helpers (handle daylight saving correctly) ---
function offsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" }).formatToParts(at);
  const name = parts.find((p) => p.type === "timeZoneName")?.value || "GMT-04:00";
  const m = name.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!m) return -240;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

/** "2026-10-24" + 600 minutes -> the real moment of 10:00 am Halifax time that day */
export function halifaxToDate(dateStr: string, minutes: number): Date {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const guess = new Date(Date.UTC(y, mo - 1, d, 0, minutes));
  const off = offsetMinutes(new Date(guess.getTime() - offsetMinutes(guess) * 60000));
  return new Date(guess.getTime() - off * 60000);
}

/** Today's date in Halifax as "YYYY-MM-DD" */
export function halifaxDate(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export function dayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function label(minutes: number): string {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export type Slot = { time: string; label: string; start: string; end: string };
export type DayResult = { date: string; open: boolean; reason?: string; slots: Slot[] };

export function slotsForDay(opts: {
  date: string;                     // "YYYY-MM-DD" (Halifax)
  now: Date;
  hours?: Hours[];
  busy: Busy[];                     // existing bookings + time off
  partsClosedDates?: string[];      // public holidays: parts stores closed
  needsPartsRun?: boolean;          // true if the filter is not in stock
  cars?: number;                    // a booking for 2 cars takes 2 x jobMinutes
  rules?: SlotRules;
}): DayResult {
  const rules = opts.rules ?? DEFAULT_SLOT_RULES;
  const today = halifaxDate(opts.now);
  const { date } = opts;

  if (date < today) return { date, open: false, reason: "That day has passed", slots: [] };
  if (date > addDays(today, rules.maxDaysAhead)) return { date, open: false, reason: `Bookings open ${rules.maxDaysAhead} days ahead`, slots: [] };

  const h = (opts.hours ?? DEFAULT_HOURS).find((x) => x.dow === dayOfWeek(date));
  if (!h) return { date, open: false, reason: "Closed this day", slots: [] };

  // Same-day booking on a public holiday only works if we already have the filter.
  if (date === today && opts.needsPartsRun !== false && (opts.partsClosedDates ?? []).includes(date)) {
    return { date, open: false, reason: "Parts stores are closed today. Please pick another day.", slots: [] };
  }

  const length = rules.jobMinutes * Math.max(1, opts.cars ?? 1);
  const earliest = opts.now.getTime() + rules.minNoticeMinutes * 60000;
  const slots: Slot[] = [];

  for (let t = h.firstStart; t <= h.lastStart; t += rules.stepMinutes) {
    const start = halifaxToDate(date, t);
    const end = new Date(start.getTime() + length * 60000);
    if (start.getTime() < earliest) continue;
    const clash = opts.busy.some((b) => start < b.end && end > b.start);
    if (clash) continue;
    slots.push({ time: `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`,
      label: label(t), start: start.toISOString(), end: end.toISOString() });
  }
  return { date, open: slots.length > 0, reason: slots.length ? undefined : "Fully booked", slots };
}
