// Grouping a day's jobs by area. Pure (no database or network), so it is tested on its own.
// The idea: a job that sends us across town and back (Halifax, then Dartmouth, then Halifax again) costs extra driving.
// For each such job we look for an open time that sits between jobs near it, and offer the customer that time.
// Nobody is moved without saying yes; whoever says no keeps their time.

export type Pt = { lat: number; lng: number };
export type Stop = Pt & { id: string; start: number; end: number; movable: boolean };   // start/end in minutes after midnight
export type Offer = { id: string; from: number; to: number; savedKm: number };

/** Straight-line km, times 1.3 for roads. Good enough to compare one order with another. */
export function km(a: Pt, b: Pt) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h)) * 1.3;
}

/** Driving for the day in time order, starting from home. */
export function dayKm(stops: Stop[], home: Pt) {
  const s = [...stops].sort((a, b) => a.start - b.start);
  let t = 0, at: Pt = home;
  for (const x of s) { t += km(at, x); at = x; }
  return t;
}

// Rush hour (3 to 6 pm): driving then is slower and burns more gas, and the bridges back to Dartmouth back up.
// A km driven in rush hour counts as RUSH km, so the plan does the far jobs earlier and ends near home.
export const RUSH_FROM = 15 * 60, RUSH_TO = 18 * 60, RUSH = 1.6;
const rushAt = (t: number) => (t >= RUSH_FROM && t < RUSH_TO ? RUSH : 1);

/**
 * What the day costs to drive: each leg in km (rush-hour legs count extra), from home and back home at the end.
 * A job during rush hour also costs extra the further it is from home: we want to be on our side (Dartmouth) by then.
 */
export function dayCost(stops: Stop[], home: Pt) {
  const s = [...stops].sort((a, b) => a.start - b.start);
  let t = 0, at: Pt = home;
  for (const x of s) {
    t += km(at, x) * rushAt(Math.max(0, x.start - 20));   // we drive in the 20 min before the job
    if (x.start < RUSH_TO && x.end > RUSH_FROM) t += km(x, home) * (RUSH - 1);
    at = x;
  }
  if (s.length) t += km(at, home) * rushAt(s[s.length - 1].end);
  return t;
}
const moveTo = (stops: Stop[], id: string, t: number) => stops.map((x) => (x.id === id ? { ...x, start: t, end: t + (x.end - x.start) } : x));

/**
 * Which customers to ask, and the time to offer each. `open(id)` gives the start times (minutes) that job could move to
 * (already free of other jobs, holds and time off). At most `max` offers, each saving at least `minKm`, never two offers
 * for the same time. A smaller change in time wins when the savings are close (about 2 km per hour moved).
 */
export function planOffers(stopsIn: Stop[], open: (id: string) => number[], home: Pt, opts: { minKm?: number; max?: number; maxShift?: number } = {}): Offer[] {
  const minKm = opts.minKm ?? 6, max = opts.max ?? 3, maxShift = opts.maxShift ?? 240;
  let stops = [...stopsIn].sort((a, b) => a.start - b.start);
  const offers: Offer[] = [];
  const taken: { start: number; end: number }[] = [];
  for (let round = 0; round < max; round++) {
    let best: (Offer & { score: number; len: number }) | null = null;
    stops.forEach((me) => {
      if (!me.movable || offers.some((o) => o.id === me.id)) return;
      const now = dayCost(stops, home);
      const len = me.end - me.start;
      for (const t of open(me.id)) {
        if (Math.abs(t - me.start) < 30 || Math.abs(t - me.start) > maxShift) continue;
        if (taken.some((x) => t < x.end && t + len > x.start)) continue;   // already offered to someone else
        const saved = now - dayCost(moveTo(stops, me.id, t), home);
        const score = saved - (Math.abs(t - me.start) / 60) * 2;
        if (saved >= minKm && (!best || score > best.score)) best = { id: me.id, from: me.start, to: t, savedKm: Math.round(saved * 10) / 10, score, len };
      }
    });
    if (!best) break;
    const b: Offer & { score: number; len: number } = best;
    offers.push({ id: b.id, from: b.from, to: b.to, savedKm: b.savedKm });
    taken.push({ start: b.to, end: b.to + b.len });
    // plan the next offer as if this one said yes
    stops = stops.map((x) => (x.id === b.id ? { ...x, start: b.to, end: b.to + b.len } : x)).sort((a, c) => a.start - c.start);
  }
  return offers;
}

export type Swap = { a: string; b: string; aStart: number; bStart: number; savedKm: number };

/**
 * Two customers trading times, when that groups the day better (Dartmouth 1:00, Bedford 2:30, Dartmouth 4:00 →
 * the Bedford job trades with a Dartmouth one, so the two Dartmouth jobs sit together). Works on a full day, since
 * nobody needs an empty time. Only jobs of the same length trade, so nothing runs into the next job.
 * Both customers are asked; the trade only happens if both say yes.
 */
export function planSwaps(stopsIn: Stop[], home: Pt, opts: { minKm?: number; max?: number; maxShift?: number } = {}): Swap[] {
  const minKm = opts.minKm ?? 6, max = opts.max ?? 1, maxShift = opts.maxShift ?? 240;
  let stops = [...stopsIn].sort((a, b) => a.start - b.start);
  const out: Swap[] = [];
  const used = new Set<string>();
  for (let round = 0; round < max; round++) {
    const base = dayCost(stops, home);
    let best: (Swap & { score: number }) | null = null;
    for (let i = 0; i < stops.length; i++) for (let j = i + 1; j < stops.length; j++) {
      const a = stops[i], b = stops[j];
      if (!a.movable || !b.movable || used.has(a.id) || used.has(b.id)) continue;
      if (a.end - a.start !== b.end - b.start || Math.abs(a.start - b.start) > maxShift) continue;
      if (km(a, b) < 2) continue;   // same area: trading changes nothing
      const traded = stops.map((x) => (x.id === a.id ? { ...x, start: b.start, end: b.end } : x.id === b.id ? { ...x, start: a.start, end: a.end } : x));
      const saved = base - dayCost(traded, home);
      const score = saved - (Math.abs(a.start - b.start) / 60) * 2 * 2;   // two people's times change
      if (saved >= minKm && (!best || score > best.score)) best = { a: a.id, b: b.id, aStart: a.start, bStart: b.start, savedKm: Math.round(saved * 10) / 10, score };
    }
    if (!best) break;
    const w: Swap & { score: number } = best;
    out.push({ a: w.a, b: w.b, aStart: w.aStart, bStart: w.bStart, savedKm: w.savedKm });
    used.add(w.a); used.add(w.b);
    stops = stops.map((x) => (x.id === w.a ? { ...x, start: w.bStart, end: w.bStart + (x.end - x.start) } : x.id === w.b ? { ...x, start: w.aStart, end: w.aStart + (x.end - x.start) } : x))
      .sort((p, q) => p.start - q.start);
  }
  return out;
}

export type Pull = { id: string; from: number; to: number; gapClosed: number };

/**
 * Closing a big empty stretch: 9:00 and 5:00 are the only jobs, so the 5:00 is asked to come to 10:15 and we do the
 * day in one go. Jobs after the biggest gap are offered the first open times right after the job before them (one after
 * the other, in the same order). Only if it closes at least `minClose` minutes and doesn't add much driving.
 */
export function planCompact(stopsIn: Stop[], open: (id: string) => number[], home: Pt, opts: { minGap?: number; minClose?: number; max?: number; maxExtra?: number } = {}): Pull[] {
  const minGap = opts.minGap ?? 150, minClose = opts.minClose ?? 90, max = opts.max ?? 2, maxExtra = opts.maxExtra ?? 8;
  let stops = [...stopsIn].sort((a, b) => a.start - b.start);
  const out: Pull[] = [];
  // the biggest gap
  let gi = -1, gap = 0;
  for (let i = 1; i < stops.length; i++) { const g = stops[i].start - stops[i - 1].end; if (g > gap) { gap = g; gi = i; } }
  if (gi < 0 || gap < minGap) return out;
  const base = dayCost(stops, home);
  let after = stops[gi - 1].end;
  for (let i = gi; i < stops.length && out.length < max; i++) {
    const me = stops[i];
    if (!me.movable) break;   // keep the order: if this one can't move, the ones after it can't close the gap either
    const len = me.end - me.start;
    const t = open(me.id).filter((x) => x >= after && x < me.start && !stops.some((o) => o.id !== me.id && x < o.end && x + len > o.start)).sort((a, b) => a - b)[0];
    if (t === undefined || me.start - t < minClose) break;
    const next = moveTo(stops, me.id, t).sort((a, b) => a.start - b.start);
    if (dayCost(next, home) - base > maxExtra) break;
    out.push({ id: me.id, from: me.start, to: t, gapClosed: me.start - t });
    stops = next; after = t + len;
  }
  return out;
}

/** Their reply to "Can we move you?": yes, no, or something else (a question: it goes to HQ like any text). */
export function replyIs(text: string): "yes" | "no" | null {
  const t = text.trim().toLowerCase().replace(/[!.\s]+$/g, "");
  if (/^(y|ya|yes|yea|yeah|yep|yup|sure|ok|okay|k|sounds good|that works|works for me|perfect|no problem|np|fine)\b/.test(t) && !/\b(not|can't|cant|don't|dont)\b/.test(t)) return "yes";
  if (/^(n|no|nope|nah|can't|cant|cannot|i can't|keep|no thanks|no thank you)\b/.test(t)) return "no";
  return null;
}

/** Google Maps directions through the day's stops in time order (free link, opens the app on a phone). */
export function routeLink(home: string, addresses: string[]) {
  if (!addresses.length) return null;
  const last = addresses[addresses.length - 1];
  const mid = addresses.slice(0, -1).slice(0, 9);   // Maps takes up to 9 stops in between
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(home)}&destination=${encodeURIComponent(last)}${mid.length ? `&waypoints=${encodeURIComponent(mid.join("|"))}` : ""}&travelmode=driving`;
}
