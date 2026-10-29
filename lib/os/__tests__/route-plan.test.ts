import { test } from "node:test";
import assert from "node:assert/strict";
import { planOffers, dayKm, replyIs, routeLink, type Stop } from "../route-plan.ts";

const home = { lat: 44.68, lng: -63.55 };                 // Dartmouth
const DART = { lat: 44.67, lng: -63.57 }, HFX = { lat: 44.64, lng: -63.6 }, BEDFORD = { lat: 44.73, lng: -63.66 };
const s = (id: string, p: { lat: number; lng: number }, start: number, movable = true): Stop => ({ id, ...p, start, end: start + 75, movable });

test("the job that sends us across and back gets offered a time next to its neighbours", () => {
  // 9:00 Halifax, 10:30 Dartmouth, 12:00 Halifax, 13:30 Dartmouth: zig-zag
  const stops = [s("a", HFX, 540), s("b", DART, 630), s("c", HFX, 720), s("d", DART, 810)];
  const open = () => [900, 990];   // 15:00 and 16:30 free
  const offers = planOffers(stops, open, home, { minKm: 1 });
  assert.ok(offers.length >= 1);
  const moved = stops.map((x) => { const o = offers.find((y) => y.id === x.id); return o ? { ...x, start: o.to, end: o.to + 75 } : x; });
  assert.ok(dayKm(moved, home) < dayKm(stops, home));
  assert.equal(new Set(offers.map((o) => o.to)).size, offers.length);   // never the same time twice
});

test("nothing to gain, or nobody can move: no offers", () => {
  const tight = [s("a", DART, 540), s("b", DART, 630), s("c", HFX, 720), s("d", HFX, 810)];
  assert.deepEqual(planOffers(tight, () => [900], home), []);
  const zig = [s("a", HFX, 540, false), s("b", BEDFORD, 630, false), s("c", HFX, 720, false)];
  assert.deepEqual(planOffers(zig, () => [900], home, { minKm: 1 }), []);
});

test("replies", () => {
  for (const y of ["Yes", "yes!", "Yeah that works", "ok", "Sure.", "sounds good"]) assert.equal(replyIs(y), "yes", y);
  for (const n of ["No", "nope", "Can't sorry", "no thanks", "I can't"]) assert.equal(replyIs(n), "no", n);
  for (const q of ["What time again?", "yes but I can't do 11", "Can you come at 3 instead?"]) assert.notEqual(replyIs(q), "yes", q);
});

test("route link goes through the stops in order", () => {
  const u = routeLink("77 Collingwood Ct, Dartmouth", ["1 A St", "2 B St", "3 C St"])!;
  assert.match(u, /destination=3%20C%20St/);
  assert.match(u, /waypoints=1%20A%20St%7C2%20B%20St/);
});
