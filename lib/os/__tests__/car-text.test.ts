import { test } from "node:test";
import assert from "node:assert/strict";
import { carFromText, carsFromText } from "../car-text.ts";

const c = (s: string) => { const x = carFromText(s); return [x.year, x.make, x.model, x.engine].join("|"); };

test("cars typed in Square notes", () => {
  assert.equal(c("2024 hyundai elantra 2L"), "2024|Hyundai|Elantra|2.0L");
  assert.equal(c("2022 Hyundai Tucson Hybrid 2.5l"), "2022|Hyundai|Tucson|2.5L");
  assert.equal(c("2017 Mitsubishi outlander v6"), "2017|Mitsubishi|Outlander|");
  assert.equal(c("2022 ford escape "), "2022|Ford|Escape|");
  assert.equal(c("2002 toyota echo"), "2002|Toyota|Echo|");
  assert.equal(c("2021 hyuandai veloster n 2l"), "2021|Hyundai|Veloster N|2.0L");
  assert.equal(c("2017 ford 150 3.5l eco boost"), "2017|Ford|F-150|3.5L");
  assert.equal(c("2024 rav4"), "2024|Toyota|RAV4|");
  assert.equal(c("2022 Chevrolet Spark (LT)"), "2022|Chevrolet|Spark|");
  assert.equal(c("2019 Acura ilx"), "2019|Acura|ILX|");
  assert.equal(c("2018 Honda Crv 1.5l"), "2018|Honda|CR-V|1.5L");
});

test("several cars in one note, headers and part numbers skipped", () => {
  const cars = carsFromText("Vehicles are:\n2025 Mitsubishi Outlander SE\n2023 Volkswagen Tiguan Highline R-Line 4Motion ");
  assert.deepEqual(cars.map((x) => `${x.year} ${x.make} ${x.model}`), ["2025 Mitsubishi Outlander", "2023 Volkswagen Tiguan"]);
  assert.deepEqual(carsFromText("2024 hyundai elantra 2L\n2100521").length, 1);
  assert.deepEqual(carsFromText("call when outside"), []);
  assert.deepEqual(carsFromText(null), []);
});
