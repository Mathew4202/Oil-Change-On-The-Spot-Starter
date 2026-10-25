import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEpaCsv, epaModelKey } from "../epa-engines.ts";

const CSV = `year,make,model,baseModel,displ,cylinders,atvType,eng_dscr,tCharger,sCharger,fuelType,drive
2019,Honda,Civic 4Dr,Civic,2.0,4,,,,,Regular Gasoline,Front-Wheel Drive
2019,Honda,Civic 4Dr,Civic,1.5,4,,,T,,Regular Gasoline,Front-Wheel Drive
2019,Honda,Civic 5Dr,Civic,1.5,4,,,T,,Regular Gasoline,Front-Wheel Drive
2024,Toyota,RAV4 AWD,RAV4,2.5,4,,,,,Regular Gasoline,All-Wheel Drive
2024,Toyota,RAV4 Hybrid AWD,RAV4,2.5,4,Hybrid,HEV,,,Regular Gasoline,All-Wheel Drive
2024,Toyota,"bZ4X AWD",bZ4X,,,EV,,,,Electricity,All-Wheel Drive
2021,Ram,2500 4WD,2500,6.7,6,Diesel,,T,,Diesel,4-Wheel Drive
1990,Honda,Accord,Accord,2.2,4,,,,,Regular Gasoline,Front-Wheel Drive`;

test("EPA list: one row per engine, turbo/hybrid/diesel labelled, EVs and old years skipped", () => {
  const r = parseEpaCsv(CSV);
  const civic = r.filter((x) => x.model === "Civic").map((x) => x.engine).sort();
  assert.deepEqual(civic, ["1.5L 4-cyl Turbo", "2.0L 4-cyl"]);
  assert.deepEqual(r.filter((x) => x.model === "RAV4").map((x) => x.engine).sort(), ["2.5L 4-cyl", "2.5L 4-cyl Hybrid"]);
  assert.equal(r.find((x) => x.make === "Ram")!.engine, "6.7L 6-cyl Diesel");
  assert.equal(r.some((x) => x.model === "bZ4X" || x.year === 1990), false);
});

test("EPA model names match ours", () => {
  assert.equal(epaModelKey("F150 Pickup 4WD"), "f150");
  assert.equal(epaModelKey("CR-V AWD"), "crv");
  assert.equal(epaModelKey("Sierra 1500 4WD"), "sierra1500");
});
