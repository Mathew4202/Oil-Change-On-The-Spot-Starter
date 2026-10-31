import { test } from "node:test";
import assert from "node:assert/strict";
import { moneyPerHour, areaOf, serviceOf, addonsOn, type HourJob } from "../money-hour.ts";

const j = (p: Partial<HourJob>): HourJob => ({ revenue: 90, cost_oil: 20, cost_parts: 8, cost_other: 1, service: "oil_change", lines: null, address: "10 Main St, Dartmouth", minutes: 60, driveKm: 0, ...p });

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
    j({ address: "1 Sunnyvale, Lower Sackville", driveKm: 20 }),              // same job, half an hour of driving
    j({ service: "Oil Change", minutes: null, address: "Halifax" }),          // imported: no booked time
    j({ service: "plan_payment", revenue: 30 }),                             // not a visit: left out
  ]);
  const dart = r.areas.find((a) => a.name === "Dartmouth")!, sack = r.areas.find((a) => a.name === "Sackville")!;
  assert.equal(dart.perHour, 61); assert.equal(sack.perHour, 40.67);
  assert.equal(r.areas.find((a) => a.name === "Halifax")!.perHour, null);
  assert.equal(r.all!.jobs, 4); assert.equal(r.untimed, 1);
});
