// Loads the service prices the owner saved on the Prices page and applies them to the pricing engine.
import { sbGet } from "./db";
import { applyPriceOverrides, PRICE_FIELDS } from "./pricing-engine";

export async function loadPrices(): Promise<Record<string, number>> {
  const rows = await sbGet<{ key: string; value: number }>("pricing_rules?select=key,value&key=like.svc_*").catch(() => []);
  const saved = Object.fromEntries(rows.map((r) => [r.key, Number(r.value)]));
  applyPriceOverrides(saved);
  return saved;
}

export const priceFieldList = () => PRICE_FIELDS.map((f) => ({ key: f.key, label: f.label, group: f.group, def: f.def, value: f.get() }));
