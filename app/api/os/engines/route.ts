// The engines a car came with, for the engine dropdown. GET /api/os/engines?year=2019&make=Honda&model=Civic
// Instant and free: the EPA engine list (car_engines, loaded once) plus the engines we have specs for.
// Only a car the EPA list doesn't have (heavy-duty trucks, Canada-only models) falls back to a one-time online lookup.
import { NextRequest, NextResponse } from "next/server";
import { sbGet } from "@/lib/os/db";
import { sameCar } from "@/lib/os/car-match";
import { epaEngines } from "@/lib/os/epa-import";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const size = (e: string) => Number(e.match(/\d+(?:\.\d)?/)?.[0] ?? 99);
// same engine written two ways ("2.0L" from our sheet, "2.0L 4-cyl" from EPA): keep one. Turbo, hybrid, diesel stay separate.
const kind = (e: string) => `${e.match(/\d\.\d/)?.[0] ?? e.toLowerCase()}|${/turbo/i.test(e) ? "t" : ""}${/plug-?in/i.test(e) ? "p" : ""}${/hybrid/i.test(e) ? "h" : ""}${/diesel|tdi|cummins|duramax|power\s*stroke|ecodiesel/i.test(e) ? "d" : ""}`;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const year = Number(q.get("year")), make = (q.get("make") || "").trim(), model = (q.get("model") || "").trim();
  if (!year || !make || !model) return NextResponse.json({ engines: [] });
  try {
    const [epa, specRows] = await Promise.all([
      epaEngines(year, make, model).catch(() => [] as string[]),
      sbGet<{ engine: string | null; make: string; model: string; source: string | null }>(`vehicle_specs?select=engine,make,model,source&year_from=lte.${year}&year_to=gte.${year}&oil_grade=not.is.null`).catch(() => []),
    ]);
    // EPA names first. Our own records add an engine only if EPA doesn't already have that size (our sheet just says
    // "1.5L" where EPA says "1.5L 4-cyl Turbo"); online lookups only count when the EPA list doesn't have the car.
    const fam = (e: string) => `${e.match(/\d\.\d/)?.[0] ?? e.toLowerCase()}|${/plug-?in/i.test(e) ? "p" : ""}${/hybrid/i.test(e) ? "h" : ""}${/diesel|tdi|cummins|duramax|power\s*stroke|ecodiesel/i.test(e) ? "d" : ""}`;
    const epaFam = new Set(epa.map(fam));
    const mineNames = sameCar(specRows, make, model).filter((r) => !epa.length || r.source === "sheet" || r.source === "job_history").map((r) => r.engine)
      .filter((e): e is string => !!e && !epaFam.has(fam(e)));
    let names: (string | null)[] = [...epa, ...mineNames];
    // not on the EPA list and never seen: look it up once (free AI first, under the daily cap)
    if (!names.filter(Boolean).length) {
      const { findSpecs } = await import("@/lib/os/quote-service");
      names = (await findSpecs(year, make, model)).rows.map((r) => r.engine);
    }
    const seen = new Map<string, string>();
    for (const e of names) { const n = e?.trim(); if (n && !seen.has(kind(n))) seen.set(kind(n), n); }
    const engines = [...seen.values()].sort((a, b) => size(a) - size(b) || a.localeCompare(b));
    return NextResponse.json({ engines, source: epa.length ? "epa" : "ours" });
  } catch (e) {
    return NextResponse.json({ engines: [], error: String(e).slice(0, 200) });
  }
}
