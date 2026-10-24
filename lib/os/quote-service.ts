// Loads what the pricing engine needs from the database and returns a quote.
import { sbGet, enc } from "@/lib/os/db";
import { quoteOilChange, DEFAULT_RULES, type VehicleClass, type Addon, type Quote } from "@/lib/os/pricing-engine";
import { detectClassFromModel } from "@/data/vehicleClass";

type Spec = { id: string; year_from: number; make: string; model: string; engine: string | null; oil_grade: string;
  capacity_l: number; oil_filter_part: string | null; verified: boolean };

const EURO = ["Volkswagen", "Audi", "Volvo", "Mercedes-Benz", "BMW", "Porsche"];

export type QuoteRequest = {
  year: number; make: string; model: string; engine?: string | null; vehicleClass?: VehicleClass | null;
  addons?: Addon["kind"][]; own?: "both" | "oil" | "filter" | null; km?: number | null;
};

export async function findSpec(year: number, make: string, model: string, engine?: string | null) {
  const rows = await sbGet<Spec>(
    `vehicle_specs?select=id,year_from,make,model,engine,oil_grade,capacity_l,oil_filter_part,verified` +
    `&make=ilike.${enc(make)}&model=ilike.${enc(model)}&year_from=gte.${year - 4}&year_from=lte.${year + 4}`);
  if (!rows.length) return { spec: null as Spec | null, match: "none" as const };
  const score = (s: Spec) => Math.abs(s.year_from - year) * 2 + (engine && s.engine && s.engine.toLowerCase() !== engine.toLowerCase() ? 10 : 0);
  const best = rows.sort((a, b) => score(a) - score(b))[0];
  const exact = best.year_from === year && (!engine || !best.engine || best.engine.toLowerCase() === engine.toLowerCase());
  return { spec: best as Spec | null, match: exact ? ("exact" as const) : ("similar" as const) };
}

export async function filterInStock(part: string | null | undefined): Promise<boolean> {
  if (!part) return false;
  const rows = await sbGet<{ on_hand: number }>(`parts?select=on_hand&part_number=eq.${enc(part)}`);
  return rows.some((r) => Number(r.on_hand) >= 1);
}

export async function buildQuote(req: QuoteRequest) {
  const [{ spec, match }, oil, rules] = await Promise.all([
    findSpec(req.year, req.make, req.model, req.engine),
    sbGet<{ grade: string; cost_per_l: number }>("oil_prices?select=grade,cost_per_l&active=is.true"),
    sbGet<{ key: string; value: number }>("pricing_rules?select=key,value"),
  ]);

  let filterCost: number | null = null;
  if (spec?.oil_filter_part) {
    const quotes = await sbGet<{ our_cost: number }>(
      `part_quotes?select=our_cost,parts!inner(part_number)&parts.part_number=eq.${enc(spec.oil_filter_part)}&order=checked_at.desc&limit=1`);
    filterCost = quotes[0]?.our_cost != null ? Number(quotes[0].our_cost) : null;
  }

  const r = Object.fromEntries(rules.map((x) => [x.key, Number(x.value)]));
  const vehicleClass = (req.vehicleClass || detectClassFromModel(req.model) || "Sedan") as VehicleClass;
  const addons: Addon[] = (req.addons ?? []).map((k) => ({ kind: k, partCost: 0 }));

  const quote: Quote = quoteOilChange({
    vehicleClass,
    make: EURO.find((e) => e.toLowerCase() === req.make.toLowerCase()) ?? req.make,
    spec: spec ? { grade: spec.oil_grade, capacityL: Number(spec.capacity_l), euro: /^euro/i.test(spec.oil_grade) } : null,
    costs: { oilPerL: Object.fromEntries(oil.map((o) => [o.grade, Number(o.cost_per_l)])), filterCost, consumables: r.consumables ?? 1 },
    rules: { ...DEFAULT_RULES, profitFloor: r.profit_floor ?? 45, hstRate: Number(r.hst_rate ?? 0.14), freeTravelKm: r.free_travel_km ?? 30 },
    ownParts: req.own ?? null,
    addons,
    distanceKm: req.km ?? null,
  });
  if (match === "similar") quote.needsReview.push(`Oil spec taken from a ${spec!.year_from} ${spec!.make} ${spec!.model}, please confirm`);
  if (addons.length) quote.needsReview.push("Add-on part prices to be added");

  return { quote, spec, match, vehicleClass, rules: r };
}
