// Download the free EPA vehicle list and save every car's engines (car_engines). Runs on our server from HQ
// (Stock screen button) and by itself at night if the list is empty. Takes about 20-40 seconds. Free.
import { unzipSync, strFromU8 } from "fflate";
import { sbGet, sbHeaders } from "@/lib/os/db";
import { parseEpaCsv } from "@/lib/os/epa-engines";

const URLS = [
  process.env.EPA_VEHICLES_URL || "https://www.fueleconomy.gov/feg/epadata/vehicles.csv.zip",
  "https://www.fueleconomy.gov/feg/epadata/vehicles.csv",
];

export async function enginesLoaded() {
  const r = await fetch(`${process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/car_engines?select=year&limit=1`,
    { headers: sbHeaders({ Prefer: "count=exact" }), cache: "no-store" }).catch(() => null);
  const n = Number(r?.headers.get("content-range")?.split("/")[1] ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function importEpaEngines(): Promise<{ ok: boolean; rows?: number; error?: string }> {
  let csv: string | null = null; let why = "";
  for (const u of URLS) {
    const res = await fetch(u, { signal: AbortSignal.timeout(30000) }).catch((e) => { why = String(e).slice(0, 100); return null; });
    if (!res?.ok) { why = res ? `EPA site answered ${res.status}` : why; continue; }
    const buf = new Uint8Array(await res.arrayBuffer());
    if (u.endsWith(".zip") || (buf[0] === 0x50 && buf[1] === 0x4b)) {
      const files = unzipSync(buf, { filter: (f) => /\.csv$/i.test(f.name) });
      const name = Object.keys(files)[0];
      if (!name) { why = "zip had no CSV in it"; continue; }
      csv = strFromU8(files[name]);
    } else csv = new TextDecoder().decode(buf);
    break;
  }
  if (!csv) return { ok: false, error: `Couldn't download the EPA list (${why || "unknown"}). Try again later.` };
  let rows;
  try { rows = parseEpaCsv(csv); } catch (e) { return { ok: false, error: String(e) }; }
  if (rows.length < 1000) return { ok: false, error: `The EPA list looked too short (${rows.length} engines). Nothing saved.` };
  const base = `${process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/car_engines?on_conflict=year,make,model,engine`;
  for (let i = 0; i < rows.length; i += 2000) {
    const res = await fetch(base, { method: "POST", headers: sbHeaders({ "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(rows.slice(i, i + 2000)) });
    if (!res.ok) return { ok: false, rows: i, error: `Saving stopped at ${i} engines (${res.status}). Run migration 0031, then try again.` };
  }
  return { ok: true, rows: rows.length };
}

/** The engines for one car from the EPA list (names matched loosely, like the rest of the app). */
export async function epaEngines(year: number, make: string, model: string): Promise<string[]> {
  const { makeKey, modelKey, modelMatch } = await import("@/lib/os/car-match");
  const { epaModelKey } = await import("@/lib/os/epa-engines");
  const rows = await sbGet<{ make: string; model: string; model_key: string; engine: string }>(
    `car_engines?select=make,model,model_key,engine&year=eq.${year}`).catch(() => []);
  const mk = makeKey(make);
  const want = modelKey(make, epaModelKey(model)) || modelKey(make, model);
  const mine = rows.filter((r) => makeKey(r.make) === mk || (mk === "ram" && makeKey(r.make) === "dodge"));
  const key = (r: { make: string; model_key: string }) => modelKey(r.make, r.model_key);
  const exact = mine.filter((r) => key(r) === want);
  const loose = exact.length ? exact : mine.filter((r) => modelMatch(make, r.model_key, want) === 1);
  return [...new Set(loose.map((r) => r.engine))];
}
