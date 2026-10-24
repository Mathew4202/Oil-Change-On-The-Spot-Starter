// Google Maps: address suggestions while typing, and the driving distance from the closer of our two start points.
// Key: GOOGLE_MAPS_API_KEY (server only, never sent to browsers). Every distance is cached so each address costs one lookup ever.
import { sbGet, sbInsert, enc } from "@/lib/os/db";

export const DEFAULT_BASES = ["77 Collingwood Court, Dartmouth, NS", "164 Flying Cloud Ch, Dartmouth, NS"];
const HFX = { latitude: 44.68, longitude: -63.55 };   // suggestions lean towards HRM
const key = () => process.env.GOOGLE_MAPS_API_KEY || "";
const places = () => process.env.MAPS_TEST_BASE || "https://places.googleapis.com";
const routes = () => process.env.MAPS_TEST_BASE || "https://routes.googleapis.com";
export const mapsReady = () => !!key();

export type Suggestion = { placeId: string; main: string; secondary: string; text: string };
export type Distance = { km: number; minutes: number; from: string; address: string | null };

export async function bases(): Promise<string[]> {
  try {
    const [r] = await sbGet<{ value: unknown }>("app_secrets?select=value&key=eq.travel_bases");
    const v = typeof r?.value === "string" ? JSON.parse(r.value) : r?.value;
    if (Array.isArray(v) && v.length && v.every((x) => typeof x === "string")) return v as string[];
  } catch { /* fall back */ }
  return DEFAULT_BASES;
}

/** Address suggestions (Canada, close to Halifax first). session ties the typing + the pick together so Google bills it as one. */
export async function suggest(input: string, session: string): Promise<Suggestion[]> {
  if (!key() || input.trim().length < 3) return [];
  const res = await fetch(`${places()}/v1/places:autocomplete`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key() },
    body: JSON.stringify({ input: input.slice(0, 120), sessionToken: session, includedRegionCodes: ["ca"], languageCode: "en",
      locationBias: { circle: { center: HFX, radius: 50000 } } }),
  });
  if (!res.ok) return [];
  const j = await res.json().catch(() => ({}));
  return (j.suggestions ?? []).map((s: { placePrediction?: { placeId: string; text?: { text: string }; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } } } }) => s.placePrediction)
    .filter(Boolean).slice(0, 5).map((p: { placeId: string; text?: { text: string }; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } } }) => ({
      placeId: p.placeId, text: p.text?.text ?? "", main: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "", secondary: p.structuredFormat?.secondaryText?.text ?? "" }));
}

/** The full address for a picked suggestion. */
export async function placeAddress(placeId: string, session?: string): Promise<string | null> {
  if (!key()) return null;
  const res = await fetch(`${places()}/v1/places/${encodeURIComponent(placeId)}${session ? `?sessionToken=${encodeURIComponent(session)}` : ""}`, {
    headers: { "X-Goog-Api-Key": key(), "X-Goog-FieldMask": "formattedAddress" },
  });
  if (!res.ok) return null;
  const j = await res.json().catch(() => ({}));
  return typeof j.formattedAddress === "string" ? j.formattedAddress.replace(/, Canada$/, "") : null;
}

const norm = (a: string) => a.toLowerCase().replace(/[.,#]/g, " ").replace(/\s+/g, " ").trim();

/** Driving km from whichever start point is closer. Cached by place / address. null = couldn't work it out. */
export async function drivingDistance(to: { placeId?: string | null; address?: string | null }): Promise<Distance | null> {
  const cacheKey = to.placeId ? `place:${to.placeId}` : to.address ? `addr:${norm(to.address)}` : "";
  if (!cacheKey) return null;
  try {
    const [hit] = await sbGet<{ km: number; minutes: number; from_base: string; address: string | null }>(`travel_cache?select=km,minutes,from_base,address&key=eq.${enc(cacheKey)}`);
    if (hit) return { km: Number(hit.km), minutes: hit.minutes, from: hit.from_base, address: hit.address };
  } catch { /* table missing: just look it up */ }
  if (!key()) return null;

  const starts = await bases();
  const dest = to.placeId ? { placeId: to.placeId } : { address: to.address };
  const res = await fetch(`${routes()}/distanceMatrix/v2:computeRouteMatrix`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key(), "X-Goog-FieldMask": "originIndex,destinationIndex,distanceMeters,duration,condition" },
    body: JSON.stringify({ origins: starts.map((a) => ({ waypoint: { address: a } })), destinations: [{ waypoint: dest }], travelMode: "DRIVE", routingPreference: "TRAFFIC_UNAWARE" }),
  });
  if (!res.ok) return null;
  const rows = (await res.json().catch(() => [])) as { originIndex?: number; distanceMeters?: number; duration?: string; condition?: string }[];
  const best = (Array.isArray(rows) ? rows : []).filter((r) => r.condition === "ROUTE_EXISTS" && typeof r.distanceMeters === "number")
    .sort((a, b) => a.distanceMeters! - b.distanceMeters!)[0];
  if (!best) return null;
  const d: Distance = { km: Math.round(best.distanceMeters! / 100) / 10, minutes: Math.round(parseFloat(best.duration || "0") / 60),
    from: starts[best.originIndex ?? 0], address: to.address ?? null };
  if (to.placeId && !d.address) d.address = await placeAddress(to.placeId).catch(() => null);
  await sbInsert("travel_cache", { key: cacheKey, km: d.km, minutes: d.minutes, from_base: d.from, address: d.address }, { upsertOn: "key" }).catch(() => null);
  return d;
}
