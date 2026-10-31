import { test } from "node:test";
import assert from "node:assert/strict";
import { moneyPerHour, areaOf, serviceOf, addonsOn, type HourJob } from "../money-hour.ts";

const j = (p: Partial<HourJob>): HourJob => ({ revenue: 90, cost_oil: 20, cost_parts: 8, cost_other: 1, service: "oil_change", lines: null, address: "10 Main St, Dartmouth", minutes: 60, driveMin: 0, ...p });

test("areas and services from messy text", () => {
  assert.equal(areaOf("22 Sunnyvale Cres, Lower Sackville NS"), "Sackville");
  assert.equal(areaOf("100 Dartmouth Rd, Bedford"), "Bedford");
  assert.equal(areaOf("5 Ochterloney St, Dartmouth"), "Dartmouth");
  assert.equal(areaOf(null), "No address on file");
  assert.equal(serviceOf("Oil Change and tire change"), "Oil change + tires");
  assert.equal(serviceOf("Tire Change"), "Tires");
  assert.equal(serviceOf("Diagnostics"), "Diagnostic");
  assert.equal(serviceOf("plan_payment"), null);
});

test("add-ons from receipt lines, or from the service text on imported jobs", () => {
  assert.deepEqual(addonsOn({ service: "oil_change", lines: [{ label: "Full synthetic oil change", amount: 90 }, { label: "Wipers", amount: 15 }] }).map((a) => [a.name, a.amount]), [["Wipers", 15]]);
  assert.deepEqual(addonsOn({ service: "Oil Change, cabin air filter, engine air filter", lines: null }).map((a) => a.name), ["Cabin air filter", "Engine air filter"]);
  assert.deepEqual(addonsOn({ service: "Tire Change", lines: null }), []);   // a tire visit isn't a tire add-on
});

test("profit per hour counts the drive out, and far jobs show it", () => {
  const r = moneyPerHour([
    j({}), j({}),                                                             // Dartmouth: $61 profit in 1 h each
    j({ address: "1 Sunnyvale, Lower Sackville", driveMin: 30 }),             // same job, half an hour of driving
    j({ service: "Oil Change", minutes: null, address: "Halifax" }),          // imported: no booked time
    j({ service: "plan_payment", revenue: 30 }),                             // not a visit: left out
  ]);
  const dart = r.areas.find((a) => a.name === "Dartmouth")!, sack = r.areas.find((a) => a.name === "Sackville")!;
  assert.equal(dart.perHour, 61); assert.equal(sack.perHour, 40.67);
  assert.equal(r.areas.find((a) => a.name === "Halifax")!.perHour, null);
  assert.equal(r.all!.jobs, 4); assert.equal(r.untimed, 1);
});

test("the day's drives: out, between jobs, back home, and slower from 3 to 6", async () => {
  const { dayDrives } = await import("../money-hour.ts");
  const home = { lat: 44.67, lng: -63.57 }, BED = { lat: 44.73, lng: -63.66 };
  // Bedford 10:00, then Dartmouth (at home) 11:30: 1 drive out to Bedford, 1 back to Dartmouth, nothing home after
  const a = dayDrives([{ id: "b", pt: BED, start: 600, end: 675 }, { id: "d", pt: home, start: 690, end: 765 }], home);
  assert.ok(Math.abs(a.get("b")! - a.get("d")!) < 0.01 && a.get("b")! > 15 && a.get("b")! < 25);   // ~12.7 km at 40 km/h
  // the same day but Bedford is last and ends at 4:15 pm: the drive home is in rush hour, so it takes longer
  const b = dayDrives([{ id: "d", pt: home, start: 600, end: 675 }, { id: "b", pt: BED, start: 900, end: 975 }], home);
  assert.ok(b.get("b")! > a.get("b")! * 2);
  // a stop with no map point gets no drive, and the drive goes around it
  const c = dayDrives([{ id: "x", pt: null, start: 600, end: 660 }, { id: "b", pt: BED, start: 700, end: 760 }], home);
  assert.equal(c.get("x"), undefined); assert.ok(c.get("b")! > 30);
});
