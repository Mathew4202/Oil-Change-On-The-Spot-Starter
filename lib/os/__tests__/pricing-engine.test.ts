import { test } from "node:test";
import assert from "node:assert/strict";
import { quoteOilChange, quoteStandalone, travelFee } from "../pricing-engine.ts";

const costs = (filterCost: number | null) => ({
  oilPerL: { "5W-20": 6.61, "5W-30": 6.61, "0W-20": 7.18, "0W-16": 8.21, "5W-40": 7.30, "Euro 0W-30": 10.73, "15W-40": 6.15 },
  filterCost, consumables: 1,
});

test("2019 Civic 0W-20 3.5 L: normal sedan price stays, profit well above floor", () => {
  const q = quoteOilChange({ vehicleClass: "Sedan", spec: { grade: "0W-20", capacityL: 3.5 }, costs: costs(5.12) });
  assert.equal(q.lines[0].amount, 90);
  assert.equal(q.cost, 31.25);
  assert.equal(q.raised, false);
  assert.equal(q.total, 102.6);
});

test("2022 Camry 0W-16 4.5 L at sedan price would make under $45, so it is raised", () => {
  const q = quoteOilChange({ vehicleClass: "Sedan", spec: { grade: "0W-16", capacityL: 4.5 }, costs: costs(9.56) });
  assert.equal(q.cost, 47.51);         // 4.5 x 8.21 + 9.56 + 1 = 47.505
  assert.equal(q.raised, true);
  assert.equal(q.lines[0].amount, 95); // 47.51 + 45 = 92.51, rounded up to 95
  assert.ok(q.profit! >= 45);
});

test("Euro: 2021 VW Atlas (3-row) Euro 0W-30 5.5 L = cost + $95, ends in .99", () => {
  const q = quoteOilChange({ vehicleClass: "Large SUV", make: "Volkswagen", spec: { grade: "Euro 0W-30", capacityL: 5.5, euro: true }, costs: costs(13.1) });
  assert.equal(q.cost, 73.11);               // 5.5 x 10.73 + 13.10 + 1 = 73.115
  assert.equal(q.lines[0].amount, 169.99);   // 168.11 -> 169.99
});

test("Euro: 2015 VW Tiguan (SUV) VW 5W-40 4.7 L = cost + $85", () => {
  const q = quoteOilChange({ vehicleClass: "SUV/Crossover", make: "Volkswagen", spec: { grade: "Euro 5W-40", capacityL: 4.7, euro: true }, costs: costs(9.1) });
  assert.equal(q.cost, 44.41);
  assert.equal(q.lines[0].amount, 129.99);
});

test("Euro: 2010 Mercedes C300 (sedan) 7 L 5W-40 = cost + $75", () => {
  const q = quoteOilChange({ vehicleClass: "Sedan", make: "Mercedes-Benz", spec: { grade: "Euro 5W-40", capacityL: 7, euro: true }, costs: costs(10.17) });
  assert.equal(q.cost, 62.27);
  assert.equal(q.lines[0].amount, 139.99);
  assert.ok(q.profit! >= 75);
});

test("Sports: GR86 0W-20 5.4 L = cost + $80", () => {
  const q = quoteOilChange({ vehicleClass: "Sports Car", make: "Toyota", spec: { grade: "0W-20", capacityL: 5.4 }, costs: costs(6.0) });
  assert.equal(q.cost, 45.77);
  assert.equal(q.lines[0].amount, 129.99);
});

test("Euro with unknown oil spec falls back to the old fixed price and is flagged", () => {
  const q = quoteOilChange({ vehicleClass: "Sedan", make: "BMW", spec: null, costs: costs(null) });
  assert.equal(q.lines[0].amount, 159.99);
  assert.ok(q.needsReview.length > 0);
});

test("unknown car is still priced at the normal price but flagged for review", () => {
  const q = quoteOilChange({ vehicleClass: "SUV/Crossover", spec: null, costs: costs(null) });
  assert.equal(q.lines[0].amount, 110);
  assert.equal(q.cost, null);
  assert.ok(q.needsReview.length > 0);
});

test("0W-8 oil we don't price yet is flagged", () => {
  const q = quoteOilChange({ vehicleClass: "Large SUV", spec: { grade: "0W-8", capacityL: 4.3 }, costs: costs(9.34) });
  assert.match(q.needsReview.join(), /0W-8/);
});

test("add-ons: wipers $15 + parts, cabin filter $10 + parts", () => {
  const q = quoteOilChange({ vehicleClass: "Sedan", spec: { grade: "5W-20", capacityL: 3.6 }, costs: costs(5.12),
    addons: [{ kind: "wipers", partCost: 15, partRetail: 19.81 }, { kind: "cabin_filter", partCost: 12, partRetail: 21.65 }] });
  assert.deepEqual(q.lines.map(l => l.amount), [90, 34.81, 31.65]);
});

test("customer brings oil and filter: SUV $60", () => {
  const q = quoteOilChange({ vehicleClass: "SUV/Crossover", ownParts: "both", spec: { grade: "0W-20", capacityL: 4 }, costs: costs(null) });
  assert.equal(q.subtotal, 60);
});

test("travel: free under 30 km, then 20/30/40, +10 per 10 km after", () => {
  assert.deepEqual([10, 29.9, 30, 39.9, 40, 50, 60, 75].map(k => travelFee(k)), [0, 0, 20, 20, 30, 40, 50, 60]);
});

test("standalone: diagnostic $100, battery $50 + battery, labour $100/h", () => {
  assert.equal(quoteStandalone({ kind: "diagnostic" }).subtotal, 100);
  assert.equal(quoteStandalone({ kind: "battery", partRetail: 189.99 }).subtotal, 239.99);
  assert.equal(quoteStandalone({ kind: "labour", hours: 1.5 }).subtotal, 150);
});

import { quoteVisit } from "../pricing-engine.ts";

test("parts visit: one $50 call-out for any number of parts", () => {
  const q = quoteVisit({ job: "parts", items: [{ kind: "wipers", partCost: 22 }, { kind: "cabin_filter", partCost: 22 }] });
  assert.deepEqual(q.lines.map((l) => [l.label, l.amount]), [["Mobile service call", 50], ["Wiper blades", 22], ["Cabin air filter", 22]]);
  assert.equal(q.subtotal, 94);
  assert.equal(q.total, 107.16);
});

test("battery only: $50 + battery", () => {
  assert.equal(quoteVisit({ job: "parts", items: [{ kind: "battery", partCost: 200 }] }).subtotal, 250);
});

test("diagnostic visit: $100, plus travel when far", () => {
  assert.equal(quoteVisit({ job: "diagnostic" }).subtotal, 100);
  assert.equal(quoteVisit({ job: "diagnostic", distanceKm: 42 }).subtotal, 130);
});

test("visit profit counts the visit fee (parts margin not counted)", () => {
  const q = quoteVisit({ job: "parts", items: [{ kind: "battery", partCost: 200 }] });
  assert.equal(q.profit, 50); assert.equal(q.cost, 200);
  assert.equal(quoteVisit({ job: "diagnostic" }).profit, 100);
});

test("tire change: $80 sedan, $90 SUV, $100 large SUV, $110 truck", () => {
  const p = (c: "Sedan" | "SUV/Crossover" | "Large SUV" | "Truck") => quoteVisit({ job: "tires", vehicleClass: c }).subtotal;
  assert.deepEqual([p("Sedan"), p("SUV/Crossover"), p("Large SUV"), p("Truck")], [80, 90, 100, 110]);
});

test("oil change + tire change on one visit (SUV): $110 + $90", () => {
  const q = quoteOilChange({ vehicleClass: "SUV/Crossover", spec: { grade: "0W-20", capacityL: 4.3 }, costs: costs(5.12), addons: [{ kind: "tires", partCost: 0 }] });
  assert.deepEqual(q.lines.map((l) => l.amount), [110, 90]);
});
