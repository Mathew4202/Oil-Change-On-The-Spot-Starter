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

/** Extra km this job adds where it is now (vs going straight from the one before to the one after). */
function detour(stops: Stop[], i: number, home: Pt) {
  const prev = i > 0 ? stops[i - 1] : home, next = stops[i + 1];
  const me = stops[i];
  return next ? km(prev, me) + km(me, next) - km(prev, next) : km(prev, me);
}

/** Extra km if this job happened at time `t` instead (the others stay where they are). */
function insertCost(others: Stop[], me: Pt, t: number, home: Pt) {
  const before = others.filter((x) => x.start < t), after = others.filter((x) => x.start >= t);
  const prev = before.length ? before[before.length - 1] : home, next = after[0];
  return next ? km(prev, me) + km(me, next) - km(prev, next) : km(prev, me);
}

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
    stops.forEach((me, i) => {
      if (!me.movable || offers.some((o) => o.id === me.id)) return;
      const now = detour(stops, i, home);
      const others = stops.filter((x) => x.id !== me.id);
      const len = me.end - me.start;
      for (const t of open(me.id)) {
        if (Math.abs(t - me.start) < 30 || Math.abs(t - me.start) > maxShift) continue;
        if (taken.some((x) => t < x.end && t + len > x.start)) continue;   // already offered to someone else
        const saved = now - insertCost(others, me, t, home);
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
