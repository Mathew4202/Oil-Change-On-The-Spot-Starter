// The free US EPA fuel economy list (fueleconomy.gov) → every year / make / model with its engine sizes.
// Pure parsing here (tested on its own); the download and save are in epa-import.ts.

export type EpaEngine = { year: number; make: string; model: string; model_key: string; engine: string; cylinders: number | null; fuel: string };

/** Small CSV reader that handles quoted fields with commas. */
export function csvRows(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let f = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}

const MAKE_FIX: Record<string, string> = { "Mercedes-Benz": "Mercedes-Benz", MINI: "MINI", "Ram": "Ram", "RAM": "Ram" };
/** "CR-V AWD", "F150 Pickup 4WD", "Civic 4Dr" → the matching key ("crv", "f150", "civic"). */
export function epaModelKey(model: string) {
  return model.toLowerCase()
    .replace(/\b(2wd|4wd|awd|fwd|rwd|4x4|4x2|ffv|cng|pickup|wagon|hatchback|coupe|convertible|sedan|van|cab chassis|chassis cab|\d dr|\ddr|long range|standard range)\b/g, " ")
    .replace(/[^a-z0-9]/g, "");
}

export function engineLabel(displ: number, cyl: number | null, o: { turbo: boolean; fuel: string }) {
  return `${displ.toFixed(1)}L${cyl ? ` ${cyl}-cyl` : ""}${o.turbo && o.fuel !== "diesel" ? " Turbo" : ""}${o.fuel === "hybrid" ? " Hybrid" : o.fuel === "plug-in" ? " Plug-in Hybrid" : o.fuel === "diesel" ? " Diesel" : ""}`;
}

/** EPA vehicles.csv → one row per year / make / model / engine (EVs skipped: no oil changes). */
export function parseEpaCsv(text: string, fromYear = 1995): EpaEngine[] {
  const rows = csvRows(text);
  const head = (rows.shift() ?? []).map((h) => h.trim().toLowerCase());
  const col = (n: string) => head.indexOf(n.toLowerCase());
  const Y = col("year"), MK = col("make"), MD = col("model"), BM = col("baseModel"), D = col("displ"), C = col("cylinders"),
    ATV = col("atvType"), ED = col("eng_dscr"), T = col("tCharger"), S = col("sCharger"), F = col("fuelType");
  if (Y < 0 || MK < 0 || MD < 0 || D < 0) throw new Error("EPA file columns not recognised");
  const out = new Map<string, EpaEngine>();
  for (const r of rows) {
    const year = Number(r[Y]); const displ = Number(r[D]);
    if (!(year >= fromYear) || !(displ > 0.5 && displ < 9)) continue;   // no engine = electric
    const atv = (r[ATV] ?? "").toLowerCase(), ed = (r[ED] ?? "").toLowerCase(), ft = (r[F] ?? "").toLowerCase();
    if (atv === "ev") continue;
    const fuel = atv === "plug-in hybrid" || /phev/.test(ed) ? "plug-in" : atv === "hybrid" || /\bhev\b|hybrid/.test(ed) ? "hybrid" : atv === "diesel" || /diesel/.test(ft) ? "diesel" : "gas";
    const turbo = (r[T] ?? "").trim().toUpperCase() === "T" || (r[S] ?? "").trim().toUpperCase() === "S" || /turbo|super/.test(ed);
    const cyl = Number(r[C]) || null;
    const make = MAKE_FIX[r[MK].trim()] ?? r[MK].trim();
    const model = ((BM >= 0 && r[BM]?.trim()) || r[MD]).trim().replace(/\s+(2WD|4WD|AWD|FWD|RWD)$/i, "");
    const engine = engineLabel(displ, cyl, { turbo, fuel });
    const k = `${year}|${make}|${model}|${engine}`;
    if (!out.has(k)) out.set(k, { year, make, model, model_key: epaModelKey(model), engine, cylinders: cyl, fuel });
  }
  return [...out.values()];
}
