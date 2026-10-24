// Price check for the new booking page.
// GET /api/os/quote?year=2019&make=Honda&model=Civic&engine=2.0L&addons=wipers,cabin_filter&own=both&km=12
import { NextRequest, NextResponse } from "next/server";
import { sbGet, enc } from "@/lib/os/db";
import { quoteOilChange, DEFAULT_RULES, type VehicleClass, type Addon } from "@/lib/os/pricing-engine";
import { detectClassFromModel } from "@/data/vehicleClass";

export const dynamic = "force-dynamic";

type Spec = { year_from: number; make: string; model: string; engine: string | null; oil_grade: string;
  capacity_l: number; oil_filter_part: string | null; verified: boolean };

const EURO = ["Volkswagen", "Audi", "Volvo", "Mercedes-Benz", "BMW", "Porsche"];

async function findSpec(year: number, make: string, model: string, engine?: string | null) {
  const rows = await sbGet<Spec>(
    `vehicle_specs?select=year_from,make,model,engine,oil_grade,capacity_l,oil_filter_part,verified` +
    `&make=ilike.${enc(make)}&model=ilike.${enc(model)}&year_from=gte.${year - 4}&year_from=lte.${year + 4}`);
  if (!rows.length) return { spec: null, match: "none" as const };
  const score = (s: Spec) => Math.abs(s.year_from - year) * 2 + (engine && s.engine && s.engine.toLowerCase() !== engine.toLowerCase() ? 10 : 0);
  const best = rows.sort((a, b) => score(a) - score(b))[0];
  const exact = best.year_from === year && (!engine || !best.engine || best.engine.toLowerCase() === engine.toLowerCase());
  return { spec: best, match: exact ? ("exact" as const) : ("similar" as const) };
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const year = Number(q.get("year"));
  const make = (q.get("make") || "").trim();
  const model = (q.get("model") || "").trim();
  if (!year || !make || !model) return NextResponse.json({ error: "year, make and model are required" }, { status: 400 });

  try {
    const [{ spec, match }, oil, rules] = await Promise.all([
      findSpec(year, make, model, q.get("engine")),
      sbGet<{ grade: string; cost_per_l: number }>("oil_prices?select=grade,cost_per_l&active=is.true"),
      sbGet<{ key: string; value: number }>("pricing_rules?select=key,value"),
    ]);

    let filterCost: number | null = null;
    if (spec?.oil_filter_part) {
      const quotes = await sbGet<{ our_cost: number; retail: number | null; parts: { part_number: string } }>(
        `part_quotes?select=our_cost,retail,parts!inner(part_number)&parts.part_number=eq.${enc(spec.oil_filter_part)}&order=checked_at.desc&limit=1`);
      filterCost = quotes[0]?.our_cost ?? null;
    }

    const r = Object.fromEntries(rules.map((x) => [x.key, Number(x.value)]));
    const vehicleClass = ((q.get("class") as VehicleClass) || detectClassFromModel(model) || "Sedan") as VehicleClass;
    const addons: Addon[] = (q.get("addons") || "").split(",").filter(Boolean)
      .map((k) => ({ kind: k as Addon["kind"], partCost: 0 }));   // part prices added once the parts lookup is live

    const quote = quoteOilChange({
      vehicleClass,
      make: EURO.find((e) => e.toLowerCase() === make.toLowerCase()) ?? make,
      spec: spec ? { grade: spec.oil_grade, capacityL: Number(spec.capacity_l), euro: /^euro/i.test(spec.oil_grade) } : null,
      costs: { oilPerL: Object.fromEntries(oil.map((o) => [o.grade, Number(o.cost_per_l)])), filterCost, consumables: r.consumables ?? 1 },
      rules: { ...DEFAULT_RULES, profitFloor: r.profit_floor ?? 45, hstRate: Number(r.hst_rate ?? 0.14), freeTravelKm: r.free_travel_km ?? 30 },
      ownParts: (q.get("own") as "both" | "oil" | "filter" | null) || null,
      addons,
      distanceKm: q.get("km") ? Number(q.get("km")) : null,
    });

    if (match === "similar") quote.needsReview.push(`Oil spec taken from a ${spec!.year_from} ${spec!.make} ${spec!.model}, please confirm`);
    if (addons.length) quote.needsReview.push("Add-on part prices still to be added");

    // Customers see the price; owners also see cost, profit and review notes.
    const owner = q.get("key") && q.get("key") === process.env.ADMIN_SECRET;
    const { cost, profit, raised, needsReview, ...publicQuote } = quote;
    return NextResponse.json({
      vehicle: { year, make, model, class: vehicleClass },
      spec: spec ? { grade: spec.oil_grade, capacityL: Number(spec.capacity_l), filter: spec.oil_filter_part, match } : null,
      ...publicQuote,
      confirmed: needsReview.length === 0,
      ...(owner ? { cost, profit, raised, needsReview } : {}),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
