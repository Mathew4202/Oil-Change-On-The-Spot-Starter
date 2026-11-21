import { test } from "node:test";
import assert from "node:assert/strict";
import { addonsFor, canonicalVisit, keepAddons } from "../addons.ts";
import { quoteOilChange, ROTATION, TIRE_CHANGE } from "../pricing-engine.ts";
import { jobMinutes } from "../job-minutes.ts";

test("a rotation can take an oil change, and an oil change can take a rotation", () => {
  assert.ok(addonsFor("rotation").includes("oil_change"));
  assert.ok(addonsFor("oil_change").includes("rotation"));
  assert.equal(addonsFor("tires").includes("rotation"), false);
  assert.deepEqual(keepAddons("rotation", ["oil_change", "wipers", "tires"]), ["oil_change", "wipers"]);
});

test("rotation + oil change is stored as an oil change with a rotation add-on", () => {
  assert.deepEqual(canonicalVisit("rotation", ["oil_change", "wipers"]), { job: "oil_change", addons: ["rotation", "wipers"] });
  assert.deepEqual(canonicalVisit("rotation", ["wipers"]), { job: "rotation", addons: ["wipers"] });
});

test("oil change plus rotation is the oil price plus the rotation price, no discount", () => {
  const costs = { oilPerL: { "0W-20": 5.12 }, filterCost: 6.5, consumables: 1 };
  const plain = quoteOilChange({ vehicleClass: "Sedan", spec: { grade: "0W-20", capacityL: 3.5 }, costs });
  const withRot = quoteOilChange({ vehicleClass: "Sedan", spec: { grade: "0W-20", capacityL: 3.5 }, costs, addons: [{ kind: "rotation", partCost: 0 }] });
  const rotLine = withRot.lines.find((l) => l.label === "Tire rotation");
  assert.equal(rotLine?.amount, ROTATION.Sedan);
  assert.equal(withRot.subtotal, plain.subtotal + ROTATION.Sedan);
});

test("an oil visit with a rotation takes the oil time plus the rotation time", () => {
  const r = { job_minutes: 45, job_minutes_rotation: 60 };
  assert.equal(jobMinutes("oil_change", r, ["rotation"]), 105);
  assert.equal(jobMinutes("oil_change", r, []), 45);
  assert.equal(TIRE_CHANGE.Sedan, 80);
});
