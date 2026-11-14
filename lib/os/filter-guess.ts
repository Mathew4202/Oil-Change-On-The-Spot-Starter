// What we know about which cars take which filter, from our own jobs and the invoices that print the car.
// Pure (tested): the routes load the rows once and ask.

export type FitRow = { year_from: number | null; year_to: number | null; make: string; model: string; engine: string | null;
  oil_filter_part?: string | null; cabin_filter_part?: string | null; air_filter_part?: string | null };
export type FilterCol = "oil_filter_part" | "cabin_filter_part" | "air_filter_part";
export type Guess = { part: string; from: string };

const low = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const litres = (e: string | null | undefined) => (e ?? "").match(/(\d\.\d)/)?.[1] ?? null;
const norm = (s: string) => s.replace(/[^a-z0-9]/gi, "").toUpperCase();

/** A car with no number on file: the number we used on the same make, model and engine in the nearest year (up to 3 years off).
 *  Filters rarely change inside a generation, but it's a "likely", so whoever buys it checks. */
export function guessFilter(rows: FitRow[], car: { year: number | null; make: string | null; model: string | null; engine?: string | null }, col: FilterCol): Guess | null {
  if (!car.year || !car.make || !car.model) return null;
  const L = litres(car.engine);
  let best: { row: FitRow; off: number } | null = null;
  for (const r of rows) {
    const pn = r[col]; if (!pn) continue;
    if (low(r.make) !== low(car.make) || low(r.model) !== low(car.model)) continue;
    const rl = litres(r.engine);
    if (L && rl && L !== rl) continue;                       // a different engine takes a different oil filter
    if (col === "oil_filter_part" && (!L || !rl) && !best) { /* no engine to compare: still usable, ranked last */ }
    const from = r.year_from ?? 0, to = r.year_to ?? r.year_from ?? 0;
    const off = car.year < from ? from - car.year : car.year > to ? car.year - to : 0;
    if (off > 3) continue;
    const score = off + (col === "oil_filter_part" && (!L || !rl) ? 0.5 : 0);
    if (!best || score < best.off) best = { row: r, off: score };
  }
  if (!best) return null;
  const r = best.row, yr = r.year_from === r.year_to || !r.year_to ? `${r.year_from}` : `${r.year_from}-${r.year_to}`;
  return { part: String(r[col]), from: `${yr} ${r.make} ${r.model}${r.engine ? ` ${litres(r.engine) ? `${litres(r.engine)}L` : r.engine}` : ""}` };
}

/** Every car we know takes this filter (or a number linked as the same part), years run together: "2016-2021 Honda Civic 1.5L". */
export function carsFor(rows: FitRow[], parts: string[], col: FilterCol): string[] {
  const want = new Set(parts.map(norm));
  const by = new Map<string, { make: string; model: string; eng: string | null; from: number; to: number }>();
  for (const r of rows) {
    const pn = r[col]; if (!pn || !want.has(norm(pn)) || !r.year_from) continue;
    const eng = litres(r.engine);
    const k = `${low(r.make)}|${low(r.model)}|${eng ?? ""}`;
    const g = by.get(k), to = r.year_to ?? r.year_from;
    if (!g) by.set(k, { make: r.make, model: r.model, eng, from: r.year_from, to });
    else { g.from = Math.min(g.from, r.year_from); g.to = Math.max(g.to, to); }
  }
  return [...by.values()].sort((a, b) => a.make.localeCompare(b.make) || a.model.localeCompare(b.model) || a.from - b.from)
    .map((g) => `${g.from === g.to ? g.from : `${g.from}-${g.to}`} ${g.make} ${g.model}${g.eng ? ` ${g.eng}L` : ""}`);
}
