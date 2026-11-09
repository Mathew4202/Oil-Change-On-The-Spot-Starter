import { test } from "node:test";
import assert from "node:assert/strict";
import { addonNeeds, sumNeeds, onShelf } from "../addon-needs.ts";

test("every add-on they picked becomes something to bring", () => {
  const n = addonNeeds(["cabin_filter", "engine_filter", "wipers", "battery", "washer_fluid", "tires"], { cabin_filter_part: "CAF1882P", air_filter_part: null, wiper_driver: "26", wiper_passenger: "16" });
  assert.deepEqual(n.map((x) => [x.label, x.qty]), [["Cabin filter CAF1882P", 1], ["Engine air filter (part # not on file)", 1], ['Wiper blade 26"', 1], ['Wiper blade 16"', 1], ["Battery (check the size)", 1], ["Washer fluid", 1]]);
});

test("unknown wiper sizes are a pair; two cars double it; same parts add up", () => {
  assert.equal(addonNeeds(["wipers"], null, 2)[0].qty, 4);
  const s = sumNeeds([addonNeeds(["cabin_filter"], { cabin_filter_part: "X1" }), addonNeeds(["cabin_filter"], { cabin_filter_part: "X1" }, 2)]);
  assert.deepEqual(s.map((x) => [x.label, x.qty]), [["Cabin filter X1", 3]]);
});

test("what's on the shelf", () => {
  const parts = [{ part_number: "X1", description: null, category: "cabin_filter", on_hand: 2 }, { part_number: "W-26", description: "Wiper 26 in", category: "wiper", on_hand: 1 }];
  assert.equal(onShelf(addonNeeds(["cabin_filter"], { cabin_filter_part: "X1" })[0], parts), 2);
  assert.equal(onShelf(addonNeeds(["wipers"], { wiper_driver: "26", wiper_passenger: "26" })[0], parts), 1);
  assert.equal(onShelf(addonNeeds(["wipers"], { wiper_driver: "16", wiper_passenger: "16" })[0], parts), 0);
  assert.equal(onShelf(addonNeeds(["battery"], null)[0], parts), null);
});
