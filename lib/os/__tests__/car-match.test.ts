import { test } from "node:test";
import assert from "node:assert/strict";
import { makeKey, modelKey, modelMatch, sameCar } from "../car-match.ts";

test("make spellings", () => {
  assert.equal(makeKey("Chevy"), makeKey("CHEVROLET"));
  assert.equal(makeKey("Mercedes"), makeKey("Mercedes-Benz"));
  assert.equal(makeKey("RAM"), makeKey("Ram"));
});

test("model spellings", () => {
  assert.equal(modelKey("Mazda", "Mazda6"), modelKey("Mazda", "6"));
  assert.equal(modelKey("Mazda", "MAZDA3"), "3");
  assert.equal(modelKey("Mitsubishi", "RVR"), modelKey("Mitsubishi", "Outlander Sport"));
  assert.equal(modelKey("Nissan", "Qashqai"), modelKey("Nissan", "Rogue Sport"));
  assert.equal(modelKey("Mercedes-Benz", "C300"), modelKey("Mercedes-Benz", "C-Class"));
  assert.equal(modelKey("Honda", "CR-V"), modelKey("Honda", "crv"));
  assert.equal(modelKey("Ram", "Ram 1500"), "1500");
});

test("trim names match loosely, different models do not", () => {
  assert.equal(modelMatch("GMC", "Sierra", "Sierra 1500"), 1);
  assert.equal(modelMatch("Toyota", "Corolla", "Corolla Hatchback"), 1);
  assert.equal(modelMatch("Ram", "1500", "1500 Classic"), 1);
  assert.equal(modelMatch("Jeep", "Cherokee", "Grand Cherokee"), 0);
  assert.equal(modelMatch("Mazda", "3", "CX-3"), 0);
  assert.equal(modelMatch("Chrysler", "200", "300"), 0);
  assert.equal(modelMatch("Toyota", "Corolla", "Corolla Cross"), 0);
  assert.equal(modelMatch("Hyundai", "Santa Fe", "Santa Fe Sport"), 0);
});

test("sameCar prefers the exact name", () => {
  const rows = [{ make: "Toyota", model: "Corolla", id: 1 }, { make: "Toyota", model: "Corolla Cross", id: 2 }, { make: "Honda", model: "Civic", id: 3 }];
  assert.deepEqual(sameCar(rows, "TOYOTA", "Corolla").map((r) => r.id), [1]);
  assert.deepEqual(sameCar(rows, "Toyota", "Corolla Hatchback").map((r) => r.id), [1]);
  assert.deepEqual(sameCar(rows, "Toyota", "Corolla Cross").map((r) => r.id), [2]);
  assert.deepEqual(sameCar(rows, "Chevy", "Cruze"), []);
});
