import { test } from "node:test";
import assert from "node:assert/strict";
import { vinOk, matchEngine, cleanVin } from "../vin.ts";

test("VIN check digit", () => {
  assert.equal(vinOk("1HGCM82633A004352"), true);     // well-known valid example
  assert.equal(vinOk("1HGCM82633A004353"), false);    // one digit off
  assert.equal(vinOk("1HGCM82633A00435"), false);     // 16 characters
  assert.equal(vinOk("1HGCM8263IA004352"), false);    // has an I
  assert.equal(cleanVin(" 1hg cm8-2633a004352 "), "1HGCM82633A004352");
});

test("engine size picks the matching engine only when there's exactly one", () => {
  assert.equal(matchEngine("2.0", ["1.5L 4-cyl turbo", "2.0L 4-cyl"]), "2.0L 4-cyl");
  assert.equal(matchEngine(6.7, ["6.4L V8 Hemi", "6.7L I6 Cummins diesel"]), "6.7L I6 Cummins diesel");
  assert.equal(matchEngine("3.5", ["3.5L V6", "3.5L V6 EcoBoost"]), null);
  assert.equal(matchEngine(null, ["2.0L"]), null);
});
