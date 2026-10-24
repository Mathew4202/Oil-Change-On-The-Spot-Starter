// Loads what the pricing engine needs, looks up unknown cars automatically, and returns a quote.
import { sbGet, sbInsert, enc } from "@/lib/os/db";
import { quoteOilChange, quoteVisit, DEFAULT_RULES, SEASONAL_DISCOUNT, type VehicleClass, type Addon, type Quote, type JobType } from "@/lib/os/pricing-engine";

// Customer price for each add-on part or top-up (settings can override; part prices get replaced by the parts lookup later)
const ADDON_DEFAULTS: Record<string, number> = { wipers: 22, cabin_filter: 22, engine_filter: 21, battery: 200, coolant: 25, washer_fluid: 10, tires: 0 };
const addonPrice = (k: string, r: Record<string, number>) => r[`addon_part_${k}`] ?? r[`addon_price_${k}`] ?? ADDON_DEFAULTS[k] ?? 0;
import { lookupOilSpec } from "@/lib/os/spec-lookup";
import { detectClassFromModel } from "@/data/vehicleClass";

export type Spec = { id: string; year_from: number; make: string; model: string; engine: string | null; oil_grade: string;
  capacity_l: number; oil_filter_part: string | null; verified: boolean; source: string; confidence: string | null; oil_spec: string | null };

const SPEC_COLS = "id,year_from,make,model,engine,oil_grade,capacity_l,oil_filter_part,verified,source,confidence,oil_spec";
const EURO = ["Volkswagen", "Audi", "Volvo", "Mercedes-Benz", "BMW", "Porsche"];

export type QuoteRequest = {
  year: number; make: string; model: string; engine?: string | null; vehicleClass?: VehicleClass | null;
  addons?: Addon["kind"][]; own?: "both" | "oil" | "filter" | null; km?: number | null;
  job?: JobType;   // oil_change (default), parts (no oil change), diagnostic or tires
  cars?: number;   // same car, several vehicles (e.g. a fleet visit): everything but travel is per car
};

const norm = (s: string | null | undefined) => (s || "").toLowerCase().replace(/[^a-z0-9.]/g, "");
const engineMatches = (want: string, have: string | null) => {
  const size = (s: string) => s.match(/\d\.\d/)?.[0];
  return !!have && (norm(have).includes(norm(want)) || norm(want).includes(norm(have)) || (!!size(want) && size(want) === size(have)));
};

async function specsFor(year: number, make: string, model: string) {
  return sbGet<Spec>(`vehicle_specs?select=${SPEC_COLS}&year_from=eq.${year}&make=ilike.${enc(make)}&model=ilike.${enc(model)}`);
}

/** Find this exact car (year/make/model). If we've never seen it, look it up once and save it. */
export async function findSpecs(year: number, make: string, model: string, engine?: string | null) {
  let rows = await specsFor(year, make, model);
  let lookedUp = false;
  if (!rows.length || (engine && !rows.some((r) => engineMatches(engine, r.engine)))) {
    const found = await lookupOilSpec(year, make, model, engine);
    if (found) {
      lookedUp = true;
      for (const e of found.engines) {
        await sbInsert("vehicle_specs", {
          year_from: year, year_to: year, make, model, engine: e.engine, fuel: e.fuel, oil_grade: e.oilGrade, oil_spec: e.oilSpec,
          capacity_l: e.capacityL, oil_filter_part: e.napaFilter, wix_filter: e.wixFilter, source: "ai_lookup", verified: false,
          confidence: found.confidence, sources: found.sources, looked_up_at: new Date().toISOString(),
        });
        if (e.napaFilter) await sbInsert("parts", { part_number: e.napaFilter, brand: "NAPA ProFormer", description: "Oil filter", category: "oil_filter" }, { upsertOn: "part_number,brand" });
      }
      rows = await specsFor(year, make, model);
    }
  }
  // Last resort (lookup unavailable): same model within 4 years
  if (!rows.length) {
    const near = await sbGet<Spec>(`vehicle_specs?select=${SPEC_COLS}&make=ilike.${enc(make)}&model=ilike.${enc(model)}&year_from=gte.${year - 4}&year_from=lte.${year + 4}`);
    near.sort((a, b) => Math.abs(a.year_from - year) - Math.abs(b.year_from - year));
    rows = near.length ? near.filter((r) => r.year_from === near[0].year_from) : [];
  }
  return { rows, lookedUp };
}

export async function filterInStock(part: string | null | undefined): Promise<boolean> {
  if (!part) return false;
  const rows = await sbGet<{ on_hand: number }>(`parts?select=on_hand&part_number=eq.${enc(part)}`);
  return rows.some((r) => Number(r.on_hand) >= 1);
}

async function filterCostFor(part: string | null): Promise<number | null> {
  if (!part) return null;
  const q = await sbGet<{ our_cost: number }>(
    `part_quotes?select=our_cost,parts!inner(part_number)&parts.part_number=eq.${enc(part)}&order=checked_at.desc&limit=1`);
  return q[0]?.our_cost != null ? Number(q[0].our_cost) : null;
}

export async function buildQuote(req: QuoteRequest) {
  if (req.job && req.job !== "oil_change" && req.job !== "seasonal") {
    // No oil change: no need to look up the oil (saves the lookup cost)
    const rules = await sbGet<{ key: string; value: number }>("pricing_rules?select=key,value");
    const r = Object.fromEntries(rules.map((x) => [x.key, Number(x.value)]));
    const items: Addon[] = req.job === "parts" ? (req.addons ?? []).filter((k) => k !== "tires").map((k) => ({ kind: k, partCost: addonPrice(k, r) })) : [];
    const vc = (req.vehicleClass || detectClassFromModel(req.model) || "Sedan") as VehicleClass;
    const quote = quoteVisit({ job: req.job, items, distanceKm: req.km ?? null, vehicleClass: vc,
      rules: { ...DEFAULT_RULES, hstRate: Number(r.hst_rate ?? 0.14), freeTravelKm: r.free_travel_km ?? 30 } });
    const vehicleClass = (req.vehicleClass || detectClassFromModel(req.model) || "Sedan") as VehicleClass;
    return { quote, spec: null as Spec | null, engines: [] as string[], lookedUp: false, vehicleClass, rules: r };
  }
  const [{ rows, lookedUp }, oil, rules] = await Promise.all([
    findSpecs(req.year, req.make, req.model, req.engine),
    sbGet<{ grade: string; cost_per_l: number }>("oil_prices?select=grade,cost_per_l&active=is.true"),
    sbGet<{ key: string; value: number }>("pricing_rules?select=key,value"),
  ]);
  const r = Object.fromEntries(rules.map((x) => [x.key, Number(x.value)]));
  const oilPerL = Object.fromEntries(oil.map((o) => [o.grade, Number(o.cost_per_l)]));
  const make = EURO.find((e) => e.toLowerCase() === req.make.toLowerCase()) ?? req.make;
  const isEuro = EURO.includes(make);
  const vehicleClass = (req.vehicleClass || detectClassFromModel(req.model) || "Sedan") as VehicleClass;
  // Seasonal package = oil change + tire change on rims, less $15. Plain oil changes don't carry a tire add-on.
  const kinds = (req.addons ?? []).filter((k) => k !== "tires");
  if (req.job === "seasonal") kinds.unshift("tires");
  const addons: Addon[] = kinds.map((k) => ({ kind: k, partCost: addonPrice(k, r) }));

  const priceWith = async (spec: Spec | null) => {
    const filterCost = (await filterCostFor(spec?.oil_filter_part ?? null)) ?? (spec ? (isEuro ? r.euro_filter_estimate ?? 15 : r.filter_estimate ?? 6.5) : null);
    return quoteOilChange({
      vehicleClass, make,
      spec: spec ? { grade: spec.oil_grade, capacityL: Number(spec.capacity_l), euro: /^euro/i.test(spec.oil_grade) } : null,
      costs: { oilPerL, filterCost, consumables: r.consumables ?? 1 },
      rules: { ...DEFAULT_RULES, profitFloor: r.profit_floor ?? 45, hstRate: Number(r.hst_rate ?? 0.14), freeTravelKm: r.free_travel_km ?? 30 },
      ownParts: req.own ?? null, addons, distanceKm: req.km ?? null,
    });
  };

  // Pick the engine: the one they chose, the only one, or else the one that costs us most (safe for profit)
  let spec: Spec | null = null;
  let quote: Quote;
  const chosen = req.engine ? rows.find((x) => engineMatches(req.engine!, x.engine)) : undefined;
  if (chosen || rows.length <= 1) {
    spec = chosen ?? rows[0] ?? null;
    quote = await priceWith(spec);
  } else {
    const priced = await Promise.all(rows.map(async (x) => ({ x, q: await priceWith(x) })));
    priced.sort((a, b) => b.q.total - a.q.total);
    spec = priced[0].x; quote = priced[0].q;
  }

  if (req.job === "seasonal") {
    const off = r.seasonal_discount ?? SEASONAL_DISCOUNT;
    const r2 = (x: number) => Math.round(x * 100) / 100;
    const at = quote.lines.findIndex((l) => /^Travel/.test(l.label));
    quote.lines.splice(at < 0 ? quote.lines.length : at, 0, { label: "Seasonal package discount", amount: -off });
    quote.subtotal = r2(quote.lines.reduce((t, l) => t + l.amount, 0));
    quote.hst = r2(quote.subtotal * Number(r.hst_rate ?? 0.14));
    quote.total = r2(quote.subtotal + quote.hst);
    if (quote.profit != null) quote.profit = r2(quote.profit - off);
  }

  // Several of the same car in one visit: every line except travel is per car
  const n = Math.max(1, Math.min(10, Math.floor(req.cars ?? 1)));
  if (n > 1) {
    const r2 = (x: number) => Math.round(x * 100) / 100;
    quote.lines = quote.lines.map((l) => (/^Travel/.test(l.label) ? l : { label: `${l.label} × ${n}`, amount: r2(l.amount * n) }));
    quote.subtotal = r2(quote.lines.reduce((t, l) => t + l.amount, 0));
    quote.hst = r2(quote.subtotal * Number(r.hst_rate ?? 0.14));
    quote.total = r2(quote.subtotal + quote.hst);
    if (quote.cost != null) quote.cost = r2(quote.cost * n);
    if (quote.profit != null) quote.profit = r2(quote.profit * n);
  }

  // Notes for the job card (not admin work): only when we truly couldn't find the oil.
  quote.needsReview = quote.needsReview.filter((n) => !/^Filter price not on file/.test(n));
  if (!spec) quote.needsReview = ["Oil spec not found online: check under the hood on arrival"];
  else if (spec.source === "ai_lookup" && spec.confidence === "low") quote.needsReview.push("Oil spec found online with low confidence: check the cap or manual on arrival");

  const engines = rows.length > 1 ? rows.map((x) => x.engine).filter(Boolean) as string[] : [];
  return { quote, spec, engines, lookedUp, vehicleClass, rules: r };
}
