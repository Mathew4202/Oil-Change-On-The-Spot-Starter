// Turning what the AI read off a fleet's vehicle list (or a photo of several VINs) into clean rows,
// and numbering the units that came without one. Pure, so it is tested on its own.
import { cleanVin, vinOk } from "./vin.ts";

export type ListRow = { unit: string | null; plate: string | null; vin: string | null; year: number | null; make: string | null; model: string | null; engine: string | null; vinBad?: boolean };

const str = (v: unknown, n: number) => (typeof v === "string" || typeof v === "number") && String(v).trim() && !/^(null|n\/?a|none|-+)$/i.test(String(v).trim()) ? String(v).trim().slice(0, n) : null;

/** The AI's JSON (an array, or {vehicles:[...]}) → rows. A VIN that fails its check digit is kept but flagged, so it can be fixed by hand. */
export function parseVehicleList(text: string): ListRow[] {
  const a = text.indexOf("["), b = text.lastIndexOf("]");
  let list: unknown[] = [];
  try {
    const raw = a >= 0 && b > a ? JSON.parse(text.slice(a, b + 1)) : JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1))?.vehicles;
    if (Array.isArray(raw)) list = raw;
  } catch { return []; }
  const out: ListRow[] = [];
  const seen = new Set<string>();
  for (const x of list.slice(0, 200)) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const rawVin = str(o.vin, 25)?.toUpperCase().replace(/[^A-Z0-9]/g, "") ?? null;
    const good = rawVin && vinOk(rawVin) ? cleanVin(rawVin) : null;
    const y = Number(o.year);
    const row: ListRow = {
      unit: str(o.unit ?? o.unit_number, 30), plate: str(o.plate, 15)?.toUpperCase().replace(/\s+/g, " ") ?? null,
      vin: good ?? (rawVin && rawVin.length >= 11 ? rawVin.slice(0, 17) : null), year: y >= 1980 && y <= 2035 ? y : null,
      make: str(o.make, 40), model: str(o.model, 60), engine: str(o.engine, 40),
      ...(rawVin && !good ? { vinBad: true } : {}),
    };
    if (!row.vin && !row.make && !row.plate && !row.unit) continue;
    const key = row.vin ?? `${row.unit}|${row.plate}|${row.year}|${row.make}|${row.model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

/** Units without a number get the next free ones after the fleet's highest number (1, 2, 3… when they have none yet). */
export function numberUnits<T extends { unit: string | null }>(rows: T[], existing: (string | null)[]): T[] {
  const taken = new Set([...existing, ...rows.map((r) => r.unit)].filter(Boolean).map((u) => String(u).toLowerCase()));
  let n = Math.max(0, ...[...existing, ...rows.map((r) => r.unit)].map((u) => (u && /^\d+$/.test(u) ? Number(u) : 0)));
  return rows.map((r) => {
    if (r.unit) return r;
    do n++; while (taken.has(String(n)));
    taken.add(String(n));
    return { ...r, unit: String(n) };
  });
}

export const LIST_PROMPT = `This is a fleet's vehicle list: a photo or a file (spreadsheet printout, registration list, insurance list), or a photo of one or more VIN plates or door stickers.
List EVERY vehicle you can see. Reply with ONLY a JSON array, one object per vehicle:
[{"unit":"their unit or fleet number, or null","plate":"licence plate, or null","vin":"17 characters, or null","year":2021,"make":"Ford","model":"Transit","engine":"e.g. 3.5L, or null"}]
A VIN never contains I, O or Q. Copy each VIN exactly; if you can't read all 17 characters, give what you can read. Use null for anything not shown. Don't invent anything.`;

export const ODOMETER_PROMPT = `This photo shows a vehicle's dashboard odometer. Reply with ONLY this JSON: {"km": 123456, "unit": "km or mi", "sure": true}
Read the total odometer (not the trip meter). If it shows miles, give the number as shown and unit "mi". If you can't read it, {"km": null}.`;

/** The odometer reading → km (miles converted). null if it couldn't be read. */
export function parseOdometer(text: string): number | null {
  try {
    const o = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const n = Number(String(o.km ?? "").replace(/[^\d.]/g, ""));
    if (!(n > 0 && n < 2_000_000)) return null;
    return Math.round(/^mi/i.test(String(o.unit || "")) ? n * 1.609344 : n);
  } catch { return null; }
}
