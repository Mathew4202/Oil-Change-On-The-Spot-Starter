// The engines a car came with, for the engine dropdown. GET /api/os/engines?year=2019&make=Honda&model=Civic
// Uses what we have on file; a car we've never seen gets looked up once (up to ~20 s) and saved.
import { NextRequest, NextResponse } from "next/server";
import { findSpecs } from "@/lib/os/quote-service";
import { learnCar } from "@/lib/os/spec-backfill";
import { sbGet } from "@/lib/os/db";
import { sameCar } from "@/lib/os/car-match";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const size = (e: string) => Number(e.match(/\d+(?:\.\d)?/)?.[0] ?? 99);

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const year = Number(q.get("year")), make = (q.get("make") || "").trim(), model = (q.get("model") || "").trim();
  if (!year || !make || !model) return NextResponse.json({ engines: [] });
  try {
    let { rows } = await findSpecs(year, make, model);
    // a car we've done but never looked up: we only know the engine(s) we saw. Learn the rest once, so the list is complete.
    const ours = rows.filter((r) => (r.source === "sheet" || r.source === "job_history"));
    if (ours.length && process.env.ANTHROPIC_API_KEY) {
      const fresh = await sbGet<{ id: string; looked_up_at: string | null }>(`vehicle_specs?select=id,looked_up_at&id=in.(${ours.map((r) => r.id).join(",")})`).catch(() => []);
      if (fresh.length && fresh.every((r) => !r.looked_up_at)) {
        await learnCar(ours.map((r) => ({ id: r.id, year_from: r.year_from, make: r.make, model: r.model, engine: r.engine, oil_filter_part: r.oil_filter_part, oil_grade: r.oil_grade })));
        rows = (await findSpecs(year, make, model)).rows;
      }
    }
    // every engine on file for this car, ours and the ones found online
    const all = await sbGet<{ engine: string | null; make: string; model: string }>(`vehicle_specs?select=engine,year_from,make,model&year_from=eq.${year}&oil_grade=not.is.null`).catch(() => []);
    const engineNames = [...rows.map((r) => r.engine), ...sameCar(all, make, model).map((r) => r.engine)];
    // one entry per engine: "2.0L" (ours) and "2.0L 4-cyl" (online) are the same engine; hybrids and diesels stay separate
    const kind = (e: string) => `${e.match(/\d\.\d/)?.[0] ?? e.toLowerCase()}|${/plug-?in|phev/i.test(e) ? "p" : ""}${/hybrid/i.test(e) ? "h" : ""}${/diesel|tdi|cummins|duramax|power\s*stroke|ecodiesel/i.test(e) ? "d" : ""}`;
    const seen = new Map<string, string>();
    for (const e of engineNames) { const n = e?.trim(); if (n && !seen.has(kind(n))) seen.set(kind(n), n); }
    const engines = [...seen.values()].sort((a, b) => size(a) - size(b) || a.localeCompare(b));
    return NextResponse.json({ engines, known: rows.length > 0 });
  } catch (e) {
    return NextResponse.json({ engines: [], error: String(e).slice(0, 200) });
  }
}
