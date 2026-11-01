import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanScan, supplierOf } from "../receipt-scan.ts";

test("NAPA receipt: part numbers cleaned, supplier, category, sums check out", () => {
  const s = cleanScan({ vendor: "NAPA Auto Parts Dartmouth", date: "2026-10-20", subtotal: 30.68, hst: 4.30, total: 34.98, paid_with: "on_account",
    items: [{ description: "PROFORMER OIL FILTER", part_number: "PPF 27356", brand: "NAPA ProFormer", qty: 4, unit_price: 5.12, line_total: 20.48, category: "oil_filter" },
            { description: "CABIN FILTER", part_number: "224211", qty: 1, unit_price: 10.20, line_total: 10.20, category: "cabin_filter" }] })!;
  assert.equal(s.supplier, "napa");
  assert.equal(s.items[0].partNumber, "27356");
  assert.equal(s.paidWith, "on_account");
  assert.equal(s.category, "parts");
  assert.deepEqual(s.warnings, []);
});

test("oil jug: grade normalised, litres kept, category oil", () => {
  const s = cleanScan({ vendor: "East Coast Lubricants", date: "2026-10-19", subtotal: 146, hst: 20.44, total: 166.44,
    items: [{ description: "FULL SYN 0w20 18.9L", qty: 1, unit_price: 146, line_total: 146, category: "oil", litres_per_unit: 18.9, oil_grade: "0w20" }] })!;
  assert.equal(s.items[0].oilGrade, "0W-20"); assert.equal(s.items[0].litresPerUnit, 18.9); assert.equal(s.category, "oil"); assert.equal(s.supplier, "eastcoast");
});

test("numbers that don't add up are flagged, not hidden", () => {
  const s = cleanScan({ vendor: "PartSource", subtotal: 50, hst: 7, total: 60, items: [{ description: "x", qty: 1, line_total: 40 }] })!;
  assert.ok(s.warnings.length >= 2);
  assert.equal(supplierOf("PARTSOURCE #788"), "partsource");
});

test("no total = not a receipt", () => { assert.equal(cleanScan({ vendor: "x" }), null); });

test("NAPA's 035 environmental fee goes onto the filter above it, not into stock", async () => {
  const { cleanScan } = await import("../receipt-scan.ts");
  const s = cleanScan({ vendor: "NAPA Dartmouth", date: "2026-11-01", subtotal: 14.87, hst: 2.08, total: 16.95, items: [
    { description: "NAPA ProFormer Oil Filter", part_number: "PPF 2100290", qty: 1, unit_price: 5.88, line_total: 5.88, category: "oil_filter" },
    { description: "FILTERS LESS THAN 8IN", part_number: "035", qty: 1, unit_price: 0.5, line_total: 0.5, category: "other" },
    { description: "NAPA ProFormer Oil Filter", part_number: "PPF 21358", qty: 1, unit_price: 7.99, line_total: 7.99, category: "oil_filter" },
    { description: "FILTERS LESS THAN 8IN", part_number: "035", qty: 1, unit_price: 0.5, line_total: 0.5, category: "other" },
  ] })!;
  assert.deepEqual(s.items.map((i) => [i.partNumber, i.lineTotal, i.unitPrice]), [["2100290", 6.38, 6.38], ["21358", 8.49, 8.49]]);
  assert.deepEqual(s.warnings, []);   // still adds up to the subtotal
});

test("gloves and shop towels are picked out, with the towels in each pack", async () => {
  const { cleanScan } = await import("../receipt-scan.ts");
  const s = cleanScan({ vendor: "Canadian Tire", date: "2026-11-01", total: 45.6, items: [
    { description: "Nitrile Gloves L 100pk", qty: 2, unit_price: 14, category: "supply" },
    { description: "Blue Shop Towels 55 sheets", qty: 3, unit_price: 4, category: "other" },
    { description: "Shop towels", qty: 1, unit_price: 6, category: "shop_towels", units_per_pack: 200 },
  ] })!;
  assert.deepEqual(s.items.map((i) => [i.category, i.unitsPerPack ?? null]), [["gloves", null], ["shop_towels", 55], ["shop_towels", 200]]);
  assert.equal(s.category, "supplies");
});

test("oil priced per litre with qty in 20 L cases (East Coast) comes out per case", async () => {
  const { cleanScan } = await import("../receipt-scan.ts");
  const s = cleanScan({ vendor: "East Coast Lubricant Limited", date: "2026-10-30", subtotal: 1737.6, hst: 243.26, total: 1980.86, items: [
    { description: "0W-20 (20L)", qty: 10, unit_price: 6.2, line_total: 1240, category: "oil", litres_per_unit: 20, oil_grade: "0W-20" },
    { description: "5W-20 (20L)", qty: 4, unit_price: 6.22, line_total: 497.6, category: "oil", litres_per_unit: 20, oil_grade: "5W-20" },
    { description: "Jug 5W-30", qty: 2, unit_price: 40, line_total: 80, category: "oil", litres_per_unit: 4.4, oil_grade: "5W-30" },
  ] })!;
  assert.deepEqual(s.items.map((i) => i.unitPrice), [124, 124.4, 40]);   // per case; the per-jug one is left alone
});
