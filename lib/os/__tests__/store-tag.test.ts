import { test } from "node:test";
import assert from "node:assert/strict";
import { tag, tagAll, storeName } from "../store-tag.ts";

const stores = { "27356": "NAPA", "9256": "PartSource", "VF3593": "PartSource" };

test("each part number says the store it's from", () => {
  assert.equal(tag("9256", stores), "PartSource 9256");
  assert.equal(tag("27356", stores), "NAPA 27356");
  assert.equal(tag("51515", stores, "NAPA"), "NAPA 51515");   // a spec number never bought: NAPA's lookup
  assert.equal(tag("51515", stores), "51515");
  assert.equal(tagAll("27356 or VF-3593", stores), "NAPA 27356 or PartSource VF-3593");
  assert.equal(tagAll("Cabin filter 9256", stores), "Cabin filter PartSource 9256");
  assert.equal(tagAll("Wipers driver 22, passenger 18", stores), "Wipers driver 22, passenger 18");
});

test("store from the receipt, or from the brand", () => {
  assert.equal(storeName("partsource", null), "PartSource");
  assert.equal(storeName("other", "NAPA ProFormer"), "NAPA");
  assert.equal(storeName(null, "PartSource Verified"), "PartSource");
  assert.equal(storeName(null, "Fram"), null);
});
