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

const westpier = (filterCost: number) => ({ ...costs(filterCost), oilPerL: { ...costs(0).oilPerL, "Euro 0W-30": 10.73, "Euro 5W-30": 13.81, "Euro 0W-40": 14.35, "Euro 0W-20": 15.45 } });

test("Euro: 2015 VW Tiguan (SUV) VW 502 40-weight 4.7 L gets Westpier Euro 0W-40 = cost + $85", () => {
  const q = quoteOilChange({ vehicleClass: "SUV/Crossover", make: "Volkswagen", spec: { grade: "Euro 0W-40", capacityL: 4.7, euro: true }, costs: westpier(9.1) });
  assert.equal(q.cost, 77.55);           // 4.7 x 14.35 + 9.10 + 1
  assert.equal(q.lines[0].amount, 164.99);
});

test("Euro: 2010 Mercedes C300 (sedan) 7 L MB 229.5 gets Euro 0W-40 = cost + $75", () => {
  const q = quoteOilChange({ vehicleClass: "Sedan", make: "Mercedes-Benz", spec: { grade: "Euro 0W-40", capacityL: 7, euro: true }, costs: westpier(10.17) });
  assert.equal(q.cost, 111.62);          // 7 x 14.35 + 10.17 + 1
  assert.equal(q.lines[0].amount, 189.99);
  assert.ok(q.profit! >= 75);
});

test("Euro: 2019 Jetta 504/507 5.5 L gets the cheap LX 0W-30 = cost + $75", () => {
  const q = quoteOilChange({ vehicleClass: "Sedan", make: "Volkswagen", spec: { grade: "Euro 0W-30", capacityL: 5.5, euro: true }, costs: westpier(15) });
  assert.equal(q.cost, 75.02);           // 5.5 x 10.73 + 15 + 1
  assert.equal(q.lines[0].amount, 154.99);
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

test("tire change: $80 sedan, $90 SUV, $100 large SUV and truck", () => {
  const p = (c: "Sedan" | "SUV/Crossover" | "Large SUV" | "Truck") => quoteVisit({ job: "tires", vehicleClass: c }).subtotal;
  assert.deepEqual([p("Sedan"), p("SUV/Crossover"), p("Large SUV"), p("Truck")], [80, 90, 100, 100]);
});

test("oil change + tire change on one visit (SUV): $110 + $90", () => {
  const q = quoteOilChange({ vehicleClass: "SUV/Crossover", spec: { grade: "0W-20", capacityL: 4.3 }, costs: costs(5.12), addons: [{ kind: "tires", partCost: 0 }] });
  assert.deepEqual(q.lines.map((l) => l.amount), [110, 90]);
});

test("sports car tire change is $100 (low, riskier to lift)", () => {
  assert.equal(quoteVisit({ job: "tires", vehicleClass: "Sports Car" }).subtotal, 100);
});

test("coolant and washer fluid add-ons use their set price", () => {
  const q = quoteOilChange({ vehicleClass: "Sedan", spec: { grade: "0W-20", capacityL: 3.5 }, costs: costs(5.12),
    addons: [{ kind: "coolant", partCost: 25 }, { kind: "washer_fluid", partCost: 10 }] });
  assert.deepEqual(q.lines.map((l) => [l.label, l.amount]), [["Full synthetic oil change (0W-20, 3.5 L)", 90], ["Coolant top-up", 25], ["Washer fluid top-up", 10]]);
});

test("profit includes tire change and add-on labour, not part prices", () => {
  const q = quoteOilChange({ vehicleClass: "Sedan", spec: { grade: "0W-20", capacityL: 3.5 }, costs: costs(5.12),
    addons: [{ kind: "tires", partCost: 0 }, { kind: "wipers", partCost: 22 }, { kind: "coolant", partCost: 25 }] });
  assert.equal(q.profit, 58.75 + 80 + 15);   // oil + tire change + wiper labour; wiper blades and coolant not counted
});

import { receiptHtml } from "../receipt.ts";
test("receipt shows HST number, lines, total, payment and escapes names", () => {
  const h = receiptHtml({ receiptNo: 1001, date: "Oct 28, 2026", customer: "<b>Kim</b> Smith", car: "2019 Honda Civic",
    lines: [{ label: "Full synthetic oil change", amount: 90 }, { label: "Oil + tire change discount", amount: -10 }],
    subtotal: 80, hst: 11.2, total: 91.2, paidWith: "etransfer", km: 84210, nextDueKm: 92210, nextDueDate: "Apr 28, 2027",
    vin: "2HGFC2F59KH512345", filter: "NAPA ProFormer 27356", logoUrl: "https://x/email-logo.png" });
  for (const want of ["RECEIPT", "#1001", "780152179RC0001", "$91.20", "E-transfer", "−$10.00", "92,210 km", "Thanks, &lt;b&gt;Kim&lt;/b&gt;.", "2HGFC2F59KH512345", "NAPA ProFormer 27356", "email-logo.png"]) assert.ok(h.includes(want), want);
});

import { fill, segments } from "../text.ts";
test("review text fills in name and link; emoji counts as Unicode", () => {
  const t = fill("Hi {first_name}, {review_link} {unknown}", { first_name: "Chloe", review_link: "https://g.page/r/x/review" });
  assert.equal(t, "Hi Chloe, https://g.page/r/x/review {unknown}");
  assert.equal(segments("a".repeat(160)), 1);
  assert.equal(segments("🚗" + "a".repeat(100)), 2);
});

test("Euro and sports cars bringing their own parts keep the full profit (not the normal-car price)", () => {
  const spec = { grade: "Euro 0W-30", capacityL: 6.5 };
  const both = (make: string | undefined, cls: "Sedan" | "SUV/Crossover" | "Large SUV" | "Sports Car") =>
    quoteOilChange({ vehicleClass: cls, make, ownParts: "both", spec, costs: costs(18) }).lines[0].amount;
  assert.equal(both("BMW", "Sedan"), 75);
  assert.equal(both("BMW", "SUV/Crossover"), 85);
  assert.equal(both("Mercedes-Benz", "Large SUV"), 95);
  assert.equal(both("Porsche", "Sports Car"), 95);
  assert.equal(both(undefined, "Sports Car"), 80);          // GR86, WRX, Mustang
  assert.equal(both("Honda", "Sedan"), 50);                 // normal cars unchanged
  // brings oil only: profit + our filter; brings filter only: profit + our oil
  const oilOnly = quoteOilChange({ vehicleClass: "Sedan", make: "BMW", ownParts: "oil", spec, costs: costs(18) });
  assert.equal(oilOnly.lines[0].amount, 94.99);              // 75 + 18 + 1 = 94 -> 94.99
  assert.equal(oilOnly.profit, 75.99);
  const filterOnly = quoteOilChange({ vehicleClass: "Sedan", make: "BMW", ownParts: "filter", spec, costs: costs(18) });
  assert.equal(filterOnly.lines[0].amount, 149.99);          // 6.5 x 10.73 + 1 + 75 = 145.75 -> 149.99
  // never cheaper than the same car with nothing brought, minus what they brought
  const full = quoteOilChange({ vehicleClass: "Sedan", make: "BMW", spec, costs: costs(18) }).lines[0].amount;
  assert.ok(full > filterOnly.lines[0].amount && filterOnly.lines[0].amount > oilOnly.lines[0].amount && oilOnly.lines[0].amount > 75);
});

test("MINI, Land Rover etc. are Euro too: cost + Euro profit, and $75 when a MINI owner brings oil and filter", () => {
  const spec = { grade: "Euro 5W-30", capacityL: 4.5 };
  const full = quoteOilChange({ vehicleClass: "Sedan", make: "MINI", spec, costs: { ...costs(16), oilPerL: { "Euro 5W-30": 10.73 } } });
  assert.equal(full.lines[0].amount, 144.99);   // 4.5 x 10.73 + 16 + 1 = 65.29 + 75 = 140.29 -> 144.99
  assert.equal(quoteOilChange({ vehicleClass: "Sedan", make: "MINI", ownParts: "both", spec, costs: costs(16) }).lines[0].amount, 75);
  assert.equal(quoteOilChange({ vehicleClass: "Large SUV", make: "Land Rover", ownParts: "both", spec, costs: costs(16) }).lines[0].amount, 95);
});

test("Euro cars get the cheapest Westpier Euro oil that's approved for them", async () => {
  const { euroOilKey } = await import("../pricing-engine.ts");
  assert.equal(euroOilKey("Volkswagen", "Euro 5W-30", "VW 504 00/507 00"), "Euro 0W-30");      // LX covers 504/507
  assert.equal(euroOilKey("Audi", "Euro 0W-30", null), "Euro 0W-30");
  assert.equal(euroOilKey("Mercedes-Benz", "Euro 5W-30", "MB 229.51"), "Euro 0W-30");
  assert.equal(euroOilKey("Mercedes-Benz", "Euro 0W-40", "MB 229.5"), "Euro 0W-40");
  assert.equal(euroOilKey("Porsche", "Euro 0W-40", "Porsche A40"), "Euro 0W-40");
  assert.equal(euroOilKey("BMW", "Euro 5W-30", "BMW LL-04"), "Euro 5W-30");                     // LX has no BMW approval
  assert.equal(euroOilKey("BMW", "Euro 0W-20", "BMW LL-17FE+"), "Euro 0W-20");
  assert.equal(euroOilKey("BMW", "Euro 5W-30", "BMW LL-01"), "Euro 0W-40");
  assert.equal(euroOilKey("MINI", "Euro 5W-30", null), "Euro 5W-30");
  assert.equal(euroOilKey("Volkswagen", "Euro 0W-20", "VW 508 00/509 00"), "Euro 0W-20");
  assert.equal(euroOilKey("Volvo", "Euro 0W-20", "VCC RBS0-2AE"), "Euro 0W-20");
});

test("a Euro oil with no price on file is never priced as cheap regular oil", () => {
  const q = quoteOilChange({ vehicleClass: "Sedan", make: "Volkswagen", spec: { grade: "Euro 0W-40", capacityL: 5.7 }, costs: { ...costs(15), oilPerL: { "5W-40": 7.30 } } });
  assert.ok(q.needsReview.some((n) => /No oil price on file/.test(n)));
  assert.equal(q.lines[0].amount, 169.99);   // safe Euro fallback price, flagged
});

test("Diesel: 6.7L Cummins 11.4 L of diesel 15W-40 = cost + $75, never the plain truck price", () => {
  const q = quoteOilChange({ vehicleClass: "Truck", spec: { grade: "Diesel 15W-40", capacityL: 11.4, diesel: true },
    costs: { oilPerL: { "Diesel 15W-40": 11.44, "5W-30": 6.61 }, filterCost: 22, consumables: 1 } });
  assert.equal(q.cost, 153.42);              // 11.4 x 11.44 + 22 + 1
  assert.equal(q.lines[0].amount, 229.99);   // 228.42 -> 229.99
  assert.ok(q.profit! >= 75);
});

test("Diesel oil with no price on file uses the dearest diesel oil we know, and flags it", () => {
  const q = quoteOilChange({ vehicleClass: "Truck", spec: { grade: "Diesel 5W-40", capacityL: 9.5, diesel: true },
    costs: { oilPerL: { "Diesel 15W-40": 11.44, "Diesel 0W-20": 13.25 }, filterCost: null, consumables: 1 } });
  assert.equal(q.cost, 146.88);              // 9.5 x 13.25 + 20 (filter guess) + 1
  assert.ok(q.needsReview.some((n) => /diesel oil/.test(n)));
  assert.ok(q.needsReview.some((n) => /Filter price not on file/.test(n)));
});

test("Two gas engines in the same truck keep the truck price while profit clears $45", () => {
  const c = { oilPerL: { "5W-20": 6.61 }, filterCost: 8, consumables: 1 };
  const a = quoteOilChange({ vehicleClass: "Truck", spec: { grade: "5W-20", capacityL: 5.7 }, costs: c });
  const b = quoteOilChange({ vehicleClass: "Truck", spec: { grade: "5W-20", capacityL: 6.6 }, costs: c });
  assert.equal(a.lines[0].amount, 130); assert.equal(b.lines[0].amount, 130);
  assert.ok(b.profit! < a.profit!);
});
