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
