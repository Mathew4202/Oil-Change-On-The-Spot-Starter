// Loads what the pricing engine needs, looks up unknown cars automatically, and returns a quote.
import { sbGet, sbInsert, sbPatch, enc } from "@/lib/os/db";
import { sameCar } from "@/lib/os/car-match";
import { euroOilKey, quoteOilChange, quoteVisit, DEFAULT_RULES, SEASONAL_DISCOUNT, type VehicleClass, type Addon, type Quote, type JobType } from "@/lib/os/pricing-engine";

// Customer price for each add-on part or top-up (settings can override; part prices get replaced by the parts lookup later)
const ADDON_DEFAULTS: Record<string, number> = { wipers: 22, cabin_filter: 22, engine_filter: 21, battery: 200, coolant: 25, washer_fluid: 10, tires: 0 };
const addonPrice = (k: string, r: Record<string, number>) => r[`addon_part_${k}`] ?? r[`addon_price_${k}`] ?? ADDON_DEFAULTS[k] ?? 0;
import { lookupOilSpec } from "@/lib/os/spec-lookup";
import { detectClassFromModel } from "@/data/vehicleClass";

export type Spec = { id: string; year_from: number; make: string; model: string; engine: string | null; oil_grade: string;
  capacity_l: number; oil_filter_part: string | null; verified: boolean; source: string; confidence: string | null; oil_spec: string | null; fuel?: string | null;
  cabin_filter_part?: string | null; air_filter_part?: string | null; wiper_driver?: string | null; wiper_passenger?: string | null; filter_note?: string | null };

const SPEC_COLS = "id,year_from,make,model,engine,oil_grade,capacity_l,oil_filter_part,verified,source,confidence,oil_spec,fuel,wix_filter,cabin_filter_part,air_filter_part,wiper_driver,wiper_passenger,filter_note";
const SPEC_COLS_OLD = "id,year_from,make,model,engine,oil_grade,capacity_l,oil_filter_part,verified,source,confidence,oil_spec,fuel";   // before migration 0026
const PART_FIELDS = ["cabin_filter_part", "air_filter_part", "wiper_driver", "wiper_passenger"] as const;
const hasOil = (r: Spec) => !!r.oil_grade && Number(r.capacity_l) > 0;
const DIESEL_WORDS = /diesel|cummins|duramax|power\s*stroke|powerstroke|ecodiesel|\btdi\b|bluetec|\bcrd\b/i;
export const isDiesel = (s: { fuel?: string | null; engine?: string | null; oil_spec?: string | null } | null) =>
  !!s && (s.fuel === "diesel" || DIESEL_WORDS.test(s.engine || "") || /\bC[JK]-4\b|\bFA-4\b|dexos\s*D/i.test(s.oil_spec || ""));
const EURO = ["Volkswagen", "Audi", "Volvo", "Mercedes-Benz", "BMW", "Porsche", "MINI", "Land Rover", "Jaguar", "Alfa Romeo", "Maserati", "FIAT"];

export type QuoteRequest = {
  year: number; make: string; model: string; engine?: string | null; vehicleClass?: VehicleClass | null;
  addons?: Addon["kind"][]; own?: "both" | "oil" | "filter" | null; km?: number | null;
  job?: JobType;   // oil_change (default), parts (no oil change), diagnostic or tires
  inSeason?: boolean;   // the visit date falls in a seasonal window (oil + tires gets the bigger discount)
  cars?: number;   // same car, several vehicles (e.g. a fleet visit): everything but travel is per car
};

const norm = (s: string | null | undefined) => (s || "").toLowerCase().replace(/[^a-z0-9.]/g, "");
export const engineMatches = (want: string, have: string | null) => {
  const size = (s: string) => s.match(/\d\.\d/)?.[0];
  return !!have && (norm(have).includes(norm(want)) || norm(want).includes(norm(have)) || (!!size(want) && size(want) === size(have)));
};

async function specRows(q: string) {
  return sbGet<Spec>(`vehicle_specs?select=${SPEC_COLS}&${q}`).catch(() => sbGet<Spec>(`vehicle_specs?select=${SPEC_COLS_OLD}&${q}`));
}

/** Every row we have for this car in this year, matched by name loosely ("Chevy Cruze LT" finds "Chevrolet Cruze"). */
async function specsFor(year: number, make: string, model: string) {
  return sameCar(await specRows(`year_from=lte.${year}&year_to=gte.${year}`), make, model);
}

/** Cars we only did filters or wipers on have no oil row: their part numbers ride along on the oil rows. */
function withParts(rows: Spec[]) {
  const oil = rows.filter(hasOil), partsOnly = rows.filter((r) => !hasOil(r));
  return oil.map((r) => {
    const x = { ...r };
    for (const f of PART_FIELDS) if (!x[f]) x[f] = partsOnly.find((p) => p[f] && p.year_from === r.year_from)?.[f] ?? null;
    return x;
  });
}

/** Find this exact car (year/make/model). If we've never seen it, look it up once and save it. */
export async function findSpecs(year: number, make: string, model: string, engine?: string | null) {
  const all = await specsFor(year, make, model);
  let rows = withParts(all);
  let lookedUp = false;
  const ours = rows.filter((r) => r.source === "sheet" || r.source === "job_history" || r.verified);
  const needLookup = !rows.length || (engine && !rows.some((r) => engineMatches(engine, r.engine)));
  // we did this car but nobody wrote the filter down: get just the filter number online and keep it
  const needFilter = !needLookup && ours.length > 0 && ours.every((r) => !r.oil_filter_part && !r.filter_note);   // filter_note set = already tried once
  if (needLookup || needFilter) {
    const found = await lookupOilSpec(year, make, model, engine).catch(() => null);   // lookup down: fall back below, never break the quote
    if (found) {
      lookedUp = true;
      for (const e of found.engines) {
        if (e.napaFilter) await sbInsert("parts", { part_number: e.napaFilter, brand: "NAPA ProFormer", description: "Oil filter", category: "oil_filter" }, { upsertOn: "part_number,brand" });
        if (needFilter) continue;
        await sbInsert("vehicle_specs", {
          year_from: year, year_to: year, make, model, engine: e.engine, fuel: e.fuel, oil_grade: e.oilGrade, oil_spec: e.oilSpec,
          capacity_l: e.capacityL, oil_filter_part: e.napaFilter, wix_filter: e.wixFilter, source: "ai_lookup", verified: false,
          confidence: found.confidence, sources: found.sources, looked_up_at: new Date().toISOString(),
        });
      }
      if (needFilter) {
        for (const r of ours) {
          const e = found.engines.length === 1 ? found.engines[0] : found.engines.find((x) => r.engine ? engineMatches(r.engine, x.engine) : false);
          await sbPatch("vehicle_specs", `id=eq.${r.id}`, e?.napaFilter ? { oil_filter_part: e.napaFilter, filter_note: "Filter number found online, check it at NAPA" }
            : { filter_note: "No filter number found online, look it up at NAPA" }).catch(() => null);
        }
      }
      rows = withParts(await specsFor(year, make, model));
    }
  }
  // Last resort (lookup unavailable): same model within 4 years
  if (!rows.length) {
    const near = withParts(sameCar(await specRows(`year_from=gte.${year - 4}&year_from=lte.${year + 4}`), make, model));
    near.sort((a, b) => Math.abs(a.year_from - year) - Math.abs(b.year_from - year));
    rows = near.length ? near.filter((r) => r.year_from === near[0].year_from) : [];
  }
  // our own record of this car beats an online lookup of it
  const mine = rows.filter((r) => r.source === "sheet" || r.source === "job_history");
  if (mine.length && (!engine || mine.some((r) => engineMatches(engine, r.engine)))) rows = mine;
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
    const vc = (req.vehicleClass || detectClassFromModel(req.model, req.make) || "Sedan") as VehicleClass;
    const quote = quoteVisit({ job: req.job, items, distanceKm: req.km ?? null, vehicleClass: vc,
      rules: { ...DEFAULT_RULES, hstRate: Number(r.hst_rate ?? 0.14), freeTravelKm: r.free_travel_km ?? 30 } });
    const vehicleClass = (req.vehicleClass || detectClassFromModel(req.model, req.make) || "Sedan") as VehicleClass;
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
  const vehicleClass = (req.vehicleClass || detectClassFromModel(req.model, req.make) || "Sedan") as VehicleClass;
  // Oil change + tire change on one visit: $15 off in season (the seasonal package), $10 off the rest of the year.
  const kinds = (req.addons ?? []).filter((k) => k !== "tires");
  const withTires = req.job === "seasonal" || (req.addons ?? []).includes("tires");
  if (withTires) kinds.unshift("tires");
  // Washer fluid is $5 with an oil change ($10 on a parts-only visit)
  const addons: Addon[] = kinds.map((k) => ({ kind: k,
    partCost: k === "washer_fluid" ? r.addon_price_washer_fluid_with_oil ?? 5 : addonPrice(k, r) }));

  const priceWith = async (spec: Spec | null) => {
    const diesel = !isEuro && isDiesel(spec);
    const filterCost = (await filterCostFor(spec?.oil_filter_part ?? null)) ?? (spec ? (isEuro ? r.euro_filter_estimate ?? 15 : diesel ? r.diesel_filter_estimate ?? 20 : r.filter_estimate ?? 6.5) : null);
    return quoteOilChange({
      vehicleClass, make,
      // European cars get the Westpier Euro oil that's approved for them (cheapest one that fits)
      spec: spec ? { grade: isEuro || /^euro/i.test(spec.oil_grade) ? euroOilKey(make, spec.oil_grade, spec.oil_spec) : diesel ? `Diesel ${spec.oil_grade.replace(/^diesel\s*/i, "")}` : spec.oil_grade,
        capacityL: Number(spec.capacity_l), euro: isEuro || /^euro/i.test(spec.oil_grade), diesel } : null,
      costs: { oilPerL, filterCost, consumables: r.consumables ?? 1 },
      rules: { ...DEFAULT_RULES, profitFloor: r.profit_floor ?? 45, bumpTo: r.profit_floor ?? 45, hstRate: Number(r.hst_rate ?? 0.14), freeTravelKm: r.free_travel_km ?? 30 },
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

  if (withTires) {
    const seasonal = req.job === "seasonal" || !!req.inSeason;
    const off = seasonal ? r.seasonal_discount ?? SEASONAL_DISCOUNT : r.tire_addon_discount ?? 10;
    const r2 = (x: number) => Math.round(x * 100) / 100;
    const at = quote.lines.findIndex((l) => /^Travel/.test(l.label));
    quote.lines.splice(at < 0 ? quote.lines.length : at, 0, { label: seasonal ? "Seasonal package discount" : "Oil + tire change discount", amount: -off });
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

  // Every engine we know for this car (the booking page always asks; "Not sure" prices the safest one)
  const engines = Array.from(new Set(rows.map((x) => x.engine).filter(Boolean))) as string[];
  return { quote, spec, engines, lookedUp, vehicleClass, rules: r };
}
