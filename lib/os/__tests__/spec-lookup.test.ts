import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLookup, toNapaCanada } from "../spec-lookup.ts";

test("reads a normal answer, even with text around the JSON", () => {
  const r = parseLookup(`Here you go:\n{"engines":[{"engine":"2.0L 4-cyl","fuel":"gas","oil_grade":"0w20","oil_spec":"API SP","capacity_l":4.4,"napa_filter":"27356","wix_filter":"57356"}],"confidence":"high","sources":["https://owners.honda.ca/manual"],"notes":null}\nThanks`, "Honda");
  assert.equal(r!.engines[0].oilGrade, "0W-20");
  assert.equal(r!.engines[0].capacityL, 4.4);
  assert.equal(r!.engines[0].napaFilter, "27356");
  assert.equal(r!.confidence, "high");
});

test("Euro cars get a Euro grade (by make or by spec)", () => {
  const vw = parseLookup(`{"engines":[{"engine":"2.0T","oil_grade":"0W-20","oil_spec":"VW 508 00","capacity_l":5.7}],"confidence":"medium","sources":["https://x.com"]}`, "Volkswagen");
  assert.equal(vw!.engines[0].oilGrade, "Euro 0W-20");
  const mini = parseLookup(`{"engines":[{"engine":"1.5T","oil_grade":"5W-30","oil_spec":"BMW LL-04","capacity_l":4.5}],"confidence":"medium","sources":["https://x.com"]}`, "Mini");
  assert.equal(mini!.engines[0].oilGrade, "Euro 5W-30");
});

test("quarts-looking or silly capacities are thrown out", () => {
  assert.equal(parseLookup(`{"engines":[{"engine":"x","oil_grade":"0W-20","capacity_l":45}],"confidence":"high","sources":["https://x"]}`, "Ford"), null);
  assert.equal(parseLookup(`{"engines":[{"engine":"x","oil_grade":"synthetic","capacity_l":4.5}],"confidence":"high","sources":["https://x"]}`, "Ford"), null);
});

test("no sources means low confidence", () => {
  const r = parseLookup(`{"engines":[{"engine":"x","oil_grade":"5W-30","capacity_l":5.7}],"confidence":"high","sources":[]}`, "Ford");
  assert.equal(r!.confidence, "low");
});

test("garbage reply returns null", () => {
  assert.equal(parseLookup("Sorry, I couldn't find it.", "Kia"), null);
});

test("filter numbers are converted to NAPA Canada format", () => {
  assert.equal(toNapaCanada("100033", "WL10033"), "2100033");   // 2020 Telluride
  assert.equal(toNapaCanada("7356", null), "27356");            // Civic
  assert.equal(toNapaCanada("27356", null), "27356");           // already Canadian
  assert.equal(toNapaCanada("2100290", null), "2100290");
  assert.equal(toNapaCanada(null, "57356"), "27356");           // from WIX only
  assert.equal(toNapaCanada(null, "WL10290"), "2100290");
  assert.equal(toNapaCanada(null, null), null);
});

test("ProFormer catalogue style 'PPF 27356MP' becomes 27356", () => {
  assert.equal(toNapaCanada("PPF27356MP", null), "27356");
  assert.equal(toNapaCanada("PPF 2100255", null), "2100255");
});
