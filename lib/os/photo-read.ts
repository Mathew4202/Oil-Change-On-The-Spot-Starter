// Reading photos with the free AI (see ai.ts): the odometer at the start of a job, and a fleet's whole vehicle list.
import { askAI, type AiFile } from "@/lib/os/ai";
import { decodeVin, readVin } from "@/lib/os/vin-photo";
import { LIST_PROMPT, ODOMETER_PROMPT, parseOdometer, parseVehicleList, type ListRow } from "@/lib/os/fleet-list";

export async function readOdometer(jpegBase64: string) {
  const a = await askAI({ prompt: ODOMETER_PROMPT, file: { mime: "image/jpeg", base64: jpegBase64 }, maxTokens: 150 });
  return a ? parseOdometer(a.text) : null;
}

export async function readVinPhoto(jpegBase64: string) {
  const r = await readVin(jpegBase64);
  return { vin: r.vin, decoded: r.vin ? await decodeVin(r.vin).catch(() => null) : null };
}

/** Every vehicle on a list or in a photo of several VINs. VINs are decoded (free) to fill the year, make, model and engine. */
export async function readVehicleList(file: AiFile): Promise<{ rows: ListRow[]; error?: string }> {
  const a = await askAI({ prompt: LIST_PROMPT, file, maxTokens: 6000, big: true });
  if (!a) return { rows: [], error: "Couldn't read it right now. Try again in a minute, or add them one at a time." };
  const rows = parseVehicleList(a.text);
  if (!rows.length) return { rows, error: "Couldn't find any vehicles in that. Try a sharper photo, closer up." };
  const queue = rows.filter((r) => r.vin && !r.vinBad);
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let r = queue.shift(); r; r = queue.shift()) {
      const d = await decodeVin(r.vin!).catch(() => null);
      if (!d) continue;
      r.year = d.year ?? r.year; r.make = d.make ? title(d.make) : r.make; r.model = d.model ?? r.model;
      if (!r.engine && d.engineL) r.engine = `${d.engineL}L${/diesel/i.test(d.fuel || "") ? " diesel" : ""}`;
    }
  }));
  return { rows };
}

// the decoder shouts ("FORD"); our lists say "Ford" (a few makes keep their capitals)
const KEEP = new Set(["BMW", "GMC", "MINI", "FIAT"]);
const title = (s: string) => s.split(/(\s|-)/).map((w) => (KEEP.has(w.toUpperCase()) ? w.toUpperCase() : w.charAt(0) + w.slice(1).toLowerCase())).join("");

/** A photo or file sent from the browser: "data:image/jpeg;base64,..." or "data:application/pdf;base64,...". */
export function fileFromDataUrl(dataUrl: unknown): AiFile | null {
  const m = String(dataUrl || "").match(/^data:(image\/jpeg|image\/png|image\/webp|application\/pdf);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return null;
  const bytes = Math.floor(m[2].length * 0.75);
  if (bytes < 300 || bytes > 4_000_000) return null;
  return { mime: m[1], base64: m[2] };
}
