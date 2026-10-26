// Fills in what the Job Tracker never recorded for cars we've done: the oil approval (dexos1, VW 508 00, API SP),
// diesel or not, the WIX number, the oil filter when nobody wrote it down, and the car's OTHER engines
// (we did a 1.5L Accord, but 2.0L Accords exist too: the engine dropdown should offer both).
// Our own grade, litres and filter stay as they are. Each car is only looked up once.
import { sbGet, sbPatch, sbInsert, enc } from "@/lib/os/db";
import { lookupOilSpec } from "@/lib/os/spec-lookup-run";
import { engineMatches } from "@/lib/os/quote-service";
import { aiReady } from "@/lib/os/ai";
import { claimLookup, finishLookup, releaseLookup, lookupKey } from "@/lib/os/ai-budget";

type Row = { id: string; year_from: number; make: string; model: string; engine: string | null; oil_filter_part: string | null; oil_grade: string | null };
const TODO = "source=in.(sheet,job_history)&oil_spec=is.null&looked_up_at=is.null&oil_grade=not.is.null";

export async function specsLeft() {
  const [all, left] = await Promise.all([
    sbGet<{ id: string }>("vehicle_specs?select=id&source=in.(sheet,job_history)&oil_grade=not.is.null"),
    sbGet<{ id: string }>(`vehicle_specs?select=id&${TODO}`),
  ]);
  return { total: all.length, left: left.length };
}

/** Look one car up online and add what we don't have. `ours` = our rows for this year/make/model. */
export async function learnCar(ours: Row[]) {
  if (!ours.length) return false;
  const { year_from: year, make, model } = ours[0];
  const now = new Date().toISOString();
  // costs money: once per car, daily cap (see ai-budget.ts)
  const key = lookupKey(year, make, model);
  const claim = await claimLookup(key);
  if (claim === "cap" || claim === "busy") return false;   // try again another day
  if (claim === "done") { await Promise.all(ours.map((r) => sbPatch("vehicle_specs", `id=eq.${r.id}`, { looked_up_at: now }).catch(() => null))); return false; }
  let down = false;
  const found = await lookupOilSpec(year, make, model).catch(() => { down = true; return null; });
  if (down) { await releaseLookup(key); return false; }   // AI not reachable: try this car again later
  await finishLookup(key, !!found);
  if (!found) { await Promise.all(ours.map((r) => sbPatch("vehicle_specs", `id=eq.${r.id}`, { looked_up_at: now }).catch(() => null))); return false; }

  const used = new Set<number>();
  for (const r of ours) {
    const i = found.engines.length === 1 ? 0 : found.engines.findIndex((x) => r.engine ? engineMatches(r.engine, x.engine) : false);
    const e = i >= 0 ? found.engines[i] : null;
    if (i >= 0) used.add(i);
    const patch: Record<string, unknown> = { looked_up_at: now };
    if (e) {
      patch.oil_spec = e.oilSpec || "API SP";
      if (e.wixFilter) patch.wix_filter = e.wixFilter;
      if (e.fuel === "diesel") patch.fuel = "diesel";
      if (!r.oil_filter_part && e.napaFilter) { patch.oil_filter_part = e.napaFilter; patch.filter_note = "Filter number found online, check it at NAPA"; }
      else if (r.oil_filter_part && e.napaFilter && e.napaFilter !== r.oil_filter_part) patch.filter_note = `We used ${r.oil_filter_part}; NAPA online lists ${e.napaFilter}`;
      if (found.sources.length) patch.sources = found.sources;
    }
    await sbPatch("vehicle_specs", `id=eq.${r.id}`, patch).catch(() => null);
  }
  // engines this model also came with that we haven't done yet
  if (ours.some((r) => r.engine)) {
    for (const [i, e] of found.engines.entries()) {
      if (used.has(i) || ours.some((r) => r.engine && engineMatches(r.engine, e.engine))) continue;
      await sbInsert("vehicle_specs", { year_from: year, year_to: year, make, model, engine: e.engine, fuel: e.fuel, oil_grade: e.oilGrade, oil_spec: e.oilSpec,
        capacity_l: e.capacityL, oil_filter_part: e.napaFilter, wix_filter: e.wixFilter, source: "ai_lookup", verified: false,
        confidence: found.confidence, sources: found.sources, looked_up_at: now }).catch(() => null);
    }
  }
  return true;
}

export async function backfillSpecs(batch = 6) {
  if (!aiReady()) return { ok: false as const, error: "Add the free GEMINI_API_KEY in Vercel first.", filled: 0, tried: 0, ...(await specsLeft()) };
  const rows = await sbGet<Row>(`vehicle_specs?select=id,year_from,make,model,engine,oil_filter_part,oil_grade&${TODO}&order=times_done.desc.nullslast&limit=${batch * 3}`);
  // one lookup per car (a car with two engines on file is still one car)
  const cars = new Map<string, Row[]>();
  for (const r of rows) { const k = `${r.year_from}|${r.make.toLowerCase()}|${r.model.toLowerCase()}`; if (cars.has(k) || cars.size < batch) cars.set(k, [...(cars.get(k) ?? []), r]); }
  // include every row we have for each car, not just the ones in this page
  const groups = await Promise.all([...cars.values()].map(async (g) => {
    const all = await sbGet<Row>(`vehicle_specs?select=id,year_from,make,model,engine,oil_filter_part,oil_grade&source=in.(sheet,job_history)&year_from=eq.${g[0].year_from}&make=eq.${enc(g[0].make)}&model=eq.${enc(g[0].model)}&oil_grade=not.is.null`).catch(() => g);
    return all.length ? all : g;
  }));
  const results: boolean[] = [];
  for (const g of groups) results.push(await learnCar(g));   // one at a time, so the daily cap is respected exactly
  const left = await specsLeft();
  const capped = !results.some(Boolean) && left.left > 0;
  return { ok: true as const, filled: results.filter(Boolean).length, tried: capped ? 0 : groups.length, ...left,
    ...(capped ? { note: "Today's lookup limit is reached. The rest will be filled tomorrow." } : {}) };
}
