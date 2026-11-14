import { test } from "node:test";
import assert from "node:assert/strict";
import { guessFilter, carsFor } from "../filter-guess.ts";

const rows = [
  { year_from: 2019, year_to: 2019, make: "Ford", model: "Escape", engine: "2.0L", oil_filter_part: "0175581" },
  { year_from: 2019, year_to: 2019, make: "Ford", model: "Escape", engine: "1.5L", oil_filter_part: "9999" },
  { year_from: 2017, year_to: 2021, make: "Honda", model: "Civic", engine: "1.5L", oil_filter_part: "27356", cabin_filter_part: "24081" },
  { year_from: 2019, year_to: 2019, make: "Honda", model: "CR-V", engine: "1.5", oil_filter_part: "27356" },
];

test("guessFilter: same car and engine, nearest year, never a different engine", () => {
  assert.deepEqual(guessFilter(rows, { year: 2020, make: "Ford", model: "Escape", engine: "2.0L" }, "oil_filter_part"), { part: "0175581", from: "2019 Ford Escape 2.0L" });
  assert.equal(guessFilter(rows, { year: 2020, make: "Ford", model: "Escape", engine: "2.5L" }, "oil_filter_part"), null);
  assert.equal(guessFilter(rows, { year: 2010, make: "Ford", model: "Escape", engine: "2.0L" }, "oil_filter_part"), null);   // too many years off
  assert.equal(guessFilter(rows, { year: 2022, make: "Honda", model: "Civic", engine: null }, "cabin_filter_part")?.part, "24081");
});

test("carsFor: every car we know takes this number", () => {
  assert.deepEqual(carsFor(rows, ["27356", "0175580"], "oil_filter_part"), ["2019 Honda CR-V 1.5L", "2017-2021 Honda Civic 1.5L"].sort((a, b) => a.includes("Civic") ? -1 : 1));
});
