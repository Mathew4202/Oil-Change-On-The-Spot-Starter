// Who to text to fill a slow day, and which open times to offer. Pure, so it is tested on its own.
import { km, type Pt } from "./route-plan.ts";

export type Candidate = { customerId: string; pt: Pt | null; due: string };

/** Pure: who to text. Closest to a job already booked that day first (within maxKm), then soonest due. */
export function pickFillIns(cands: Candidate[], booked: Pt[], opts: { max: number; maxKm?: number }) {
  const maxKm = opts.maxKm ?? 6;
  return cands
    .map((c) => ({ c, d: c.pt && booked.length ? Math.min(...booked.map((b) => km(b, c.pt!))) : Infinity }))
    .filter((x) => x.d <= maxKm)
    .sort((a, b) => Math.round(a.d) - Math.round(b.d) || a.c.due.localeCompare(b.c.due))
    .slice(0, opts.max).map((x) => x.c.customerId);
}

/** Pure: up to 3 open times to offer, the ones closest to a job already booked (so the stops sit together), at least
 * `gap` apart so they're real choices. Times are numbers on one scale (minutes or milliseconds: pass gap to match). */
export function pickTimes(open: number[], booked: number[], n = 3, gap = 60) {
  const near = (t: number) => Math.min(...booked.map((b) => Math.abs(b - t)));
  const out: number[] = [];
  for (const t of [...open].sort((a, b) => near(a) - near(b) || a - b)) {
    if (out.length >= n) break;
    if (out.every((x) => Math.abs(x - t) >= gap)) out.push(t);
  }
  return out.sort((a, b) => a - b);
}
