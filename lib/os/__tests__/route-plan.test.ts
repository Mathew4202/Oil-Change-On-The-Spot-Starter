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
  const offers = planOffers(stops, open, home, { minKm: 1, maxShift: 300 });
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

test("a full day: Dartmouth 1:00, Bedford 2:30, Dartmouth 4:00 → the Bedford job trades so the Dartmouth jobs sit together", async () => {
  const { planSwaps, dayKm } = await import("../route-plan.ts");
  const stops = [s("d1", DART, 780), s("bed", BEDFORD, 870), s("d2", DART, 960)];
  const sw = planSwaps(stops, home);
  assert.equal(sw.length, 1);
  assert.ok([sw[0].a, sw[0].b].includes("bed"));
  const traded = stops.map((x) => (x.id === sw[0].a ? { ...x, start: sw[0].bStart } : x.id === sw[0].b ? { ...x, start: sw[0].aStart } : x));
  const order = [...traded].sort((p, q) => p.start - q.start).map((x) => x.id);
  assert.notEqual(order[1], "bed");   // Bedford is no longer stuck between the two Dartmouth jobs
  assert.ok(dayKm(traded, home) < dayKm(stops, home));
  // can't trade: different lengths, or someone who can't be texted
  assert.deepEqual(planSwaps([s("d1", DART, 780), { ...s("bed", BEDFORD, 870), end: 870 + 120 }, s("d2", DART, 960)], home), []);
  assert.deepEqual(planSwaps([s("d1", DART, 780, false), s("bed", BEDFORD, 870), s("d2", DART, 960, false)], home), []);
});

test("rush hour: the far job goes first and the day ends near home (Dartmouth)", async () => {
  const { planSwaps, dayCost } = await import("../route-plan.ts");
  // Dartmouth 1:00, Dartmouth 2:30, Bedford 4:00 → Bedford would be driven in rush hour and we'd come back across in traffic
  const stops = [s("d1", DART, 780), s("d2", DART, 870), s("bed", BEDFORD, 960)];
  const sw = planSwaps(stops, home);
  assert.equal(sw.length, 1);
  const traded = stops.map((x) => (x.id === sw[0].a ? { ...x, start: sw[0].bStart, end: sw[0].bStart + 75 } : x.id === sw[0].b ? { ...x, start: sw[0].aStart, end: sw[0].aStart + 75 } : x));
  const order = [...traded].sort((p, q) => p.start - q.start).map((x) => x.id);
  assert.equal(order[0], "bed");
  assert.ok(dayCost(traded, home) < dayCost(stops, home));
  // the same Bedford job in the morning costs less than in rush hour
  assert.ok(dayCost([s("bed", BEDFORD, 600)], home) < dayCost([s("bed", BEDFORD, 960)], home));
});

test("a big empty stretch: 9:00 and 5:00 only → the 5:00 is asked to come right after the 9:00", async () => {
  const { planCompact } = await import("../route-plan.ts");
  const stops = [s("a", DART, 540), s("b", DART, 1020)];
  const open = () => [630, 645, 720, 900];   // 10:30 is the first open time after the 9:00 job
  const p = planCompact(stops, open, home);
  assert.equal(p.length, 1);
  assert.equal(p[0].id, "b"); assert.equal(p[0].to, 630);
  // two jobs after the gap both come forward, in order, without landing on each other
  const p2 = planCompact([s("a", DART, 540), s("b", DART, 1020), s("c", DART, 1110)], () => [630, 645, 720, 735, 900], home);
  assert.deepEqual(p2.map((x) => [x.id, x.to]), [["b", 630], ["c", 720]]);
  // no big gap, or the late one can't be texted: nothing
  assert.deepEqual(planCompact([s("a", DART, 540), s("b", DART, 640)], open, home), []);
  assert.deepEqual(planCompact([s("a", DART, 540), s("b", DART, 1020, false)], open, home), []);
  // a gap that only closes a little isn't worth asking about
  assert.deepEqual(planCompact([s("a", DART, 540), s("b", DART, 1020)], () => [960], home), []);
});

test("slow-day fill-ins: nearest to a booked job first, nobody far away, times next to the booked jobs", async () => {
  const { pickFillIns, pickTimes } = await import("../fill-ins-pick.ts");
  const booked = [DART];
  const c = [
    { customerId: "far", pt: { lat: 44.85, lng: -63.7 }, due: "2026-11-01" },   // Sackville-ish, too far from a Dartmouth day
    { customerId: "near-later", pt: { lat: 44.672, lng: -63.572 }, due: "2026-11-20" },
    { customerId: "near-sooner", pt: { lat: 44.671, lng: -63.571 }, due: "2026-11-05" },
    { customerId: "no-address", pt: null, due: "2026-11-01" },
  ];
  assert.deepEqual(pickFillIns(c, booked, { max: 3 }), ["near-sooner", "near-later"]);
  assert.deepEqual(pickFillIns(c, booked, { max: 1 }), ["near-sooner"]);
  assert.deepEqual(pickTimes([540, 600, 690, 780, 900, 1020], [630], 3), [540, 600, 690]);
  assert.deepEqual(pickTimes([450, 480, 720], [540, 630], 3), [480, 720]);   // 7:30 and 8:00 are too close: one of them
});
