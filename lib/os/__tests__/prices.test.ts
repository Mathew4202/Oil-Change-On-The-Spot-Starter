import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPriceOverrides, OIL_BASE, TIRE_CHANGE, ROTATION, SERVICE_PRICES } from "../pricing-engine.ts";

test("saved prices replace the defaults, and a missing one goes back to the default", () => {
  applyPriceOverrides({ svc_oil_sedan: 99, svc_tire_truck: 125, svc_diagnostic: 120 });
  assert.equal(OIL_BASE.Sedan, 99);
  assert.equal(TIRE_CHANGE.Truck, 125);
  assert.equal(SERVICE_PRICES.diagnostic, 120);
  assert.equal(ROTATION.Truck, 110, "rotation keeps its own default when nothing is saved for it");
  applyPriceOverrides({});
  assert.equal(OIL_BASE.Sedan, 90);
  assert.equal(TIRE_CHANGE.Truck, 110);
  assert.equal(SERVICE_PRICES.diagnostic, 100);
});
