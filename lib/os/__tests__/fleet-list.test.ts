import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVehicleList, numberUnits, parseOdometer } from "../fleet-list.ts";

test("a photographed list becomes clean rows; a misread VIN is flagged, not dropped", () => {
  const ai = 'Here you go:\n[{"unit":"12","plate":"FHK 221","vin":"1FTBR1C82MKA12345","year":2021,"make":"Ford","model":"Transit","engine":null},' +
    '{"unit":null,"plate":"n/a","vin":"2T1BURHE0JC123456","year":"2018","make":"Toyota","model":"Corolla","engine":"1.8L"},' +
    '{"unit":"14","plate":null,"vin":"2T1BURHE0JC123456","year":null,"make":null,"model":null,"engine":null},' +
    '{"unit":null,"plate":null,"vin":null,"year":null,"make":null,"model":null,"engine":null}]';
  const rows = parseVehicleList(ai);
  assert.equal(rows.length, 2);                          // the duplicate VIN and the empty row are gone
  assert.equal(rows[0].plate, "FHK 221");
  assert.equal(rows[1].plate, null);                     // "n/a"
  assert.equal(rows[1].year, 2018);
  assert.ok(rows.some((r) => r.vinBad));                  // made-up VINs fail the check digit
});

test("good VIN passes; units numbered after their highest", () => {
  const rows = parseVehicleList('[{"vin":"1HGCM82633A004352","unit":""},{"vin":null,"make":"Ford","model":"F-150","year":2020}]');
  assert.equal(rows[0].vin, "1HGCM82633A004352");
  assert.equal(rows[0].vinBad, undefined);
  const n = numberUnits(rows, ["3", "7", "A1", null]);
  assert.deepEqual(n.map((r) => r.unit), ["8", "9"]);
  assert.deepEqual(numberUnits([{ unit: null }, { unit: "2" }, { unit: null }], []).map((r) => r.unit), ["3", "2", "4"]);
});

test("odometer read in km or miles", () => {
  assert.equal(parseOdometer('{"km": 84210, "unit": "km"}'), 84210);
  assert.equal(parseOdometer('{"km": "100,000", "unit": "mi"}'), 160934);
  assert.equal(parseOdometer('{"km": null}'), null);
});
