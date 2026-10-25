// Fills in what the Job Tracker never recorded for cars we've done: the oil approval (dexos1, VW 508 00, API SP),
// diesel or not, the WIX number, and the oil filter when nobody wrote it down. Our own grade, litres and filter stay as they are.
// Runs a few cars at a time (HQ Stock button, and a small batch every night). Each car is only looked up once.
import { sbGet, sbPatch } from "@/lib/os/db";
import { lookupOilSpec } from "@/lib/os/spec-lookup";
import { engineMatches } from "@/lib/os/quote-service";

type Row = { id: string; year_from: number; make: string; model: string; engine: string | null; oil_filter_part: string | null; oil_grade: string | null };
const TODO = "source=in.(sheet,job_history)&oil_spec=is.null&looked_up_at=is.null&oil_grade=not.is.null";

export async function specsLeft() {
  const [all, left] = await Promise.all([
    sbGet<{ id: string }>("vehicle_specs?select=id&source=in.(sheet,job_history)&oil_grade=not.is.null"),
    sbGet<{ id: string }>(`vehicle_specs?select=id&${TODO}`),
  ]);
  return { total: all.length, left: left.length };
}

export async function backfillSpecs(batch = 6) {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false as const, error: "Add ANTHROPIC_API_KEY in Vercel first.", filled: 0, ...(await specsLeft()) };
  const rows = await sbGet<Row>(`vehicle_specs?select=id,year_from,make,model,engine,oil_filter_part,oil_grade&${TODO}&order=times_done.desc.nullslast&limit=${batch}`);
  let filled = 0;
  await Promise.all(rows.map(async (r) => {
    const found = await lookupOilSpec(r.year_from, r.make, r.model, r.engine).catch(() => null);
    const e = !found ? null : found.engines.length === 1 ? found.engines[0] : found.engines.find((x) => r.engine ? engineMatches(r.engine, x.engine) : false) ?? null;
    const patch: Record<string, unknown> = { looked_up_at: new Date().toISOString() };
    if (e) {
      patch.oil_spec = e.oilSpec || "API SP";
      if (e.wixFilter) patch.wix_filter = e.wixFilter;
      if (e.fuel === "diesel") patch.fuel = "diesel";
      if (!r.oil_filter_part && e.napaFilter) { patch.oil_filter_part = e.napaFilter; patch.filter_note = "Filter number found online, check it at NAPA"; }
      else if (r.oil_filter_part && e.napaFilter && e.napaFilter !== r.oil_filter_part) patch.filter_note = `We used ${r.oil_filter_part}; NAPA online lists ${e.napaFilter}`;
      if (found!.sources.length) patch.sources = found!.sources;
      filled++;
    }
    await sbPatch("vehicle_specs", `id=eq.${r.id}`, patch).catch(() => null);
  }));
  return { ok: true as const, filled, tried: rows.length, ...(await specsLeft()) };
}
