// Map points for addresses, free: OpenStreetMap's Nominatim (no key, no card). Cached forever in geo_cache.
import { sbGet, sbInsert, enc } from "@/lib/os/db";
import type { Pt } from "@/lib/os/route-plan";

const norm = (a: string) => a.toLowerCase().replace(/[.,#]/g, " ").replace(/\s+/g, " ").trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastCall = 0;

/** Map point for an address. Cached forever, so each address is looked up once. OpenStreetMap asks for 1 lookup a second at most. */
export async function geocode(address: string | null | undefined): Promise<Pt | null> {
  const a = (address || "").trim();
  if (a.length < 6) return null;
  const k = norm(a);
  const [hit] = await sbGet<{ lat: number | null; lng: number | null }>(`geo_cache?select=lat,lng&key=eq.${enc(k)}`).catch(() => []);
  if (hit) return hit.lat != null && hit.lng != null ? { lat: Number(hit.lat), lng: Number(hit.lng) } : null;
  const wait = 1100 - (Date.now() - lastCall);
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  const q = /nova scotia|\bns\b/i.test(a) ? a : `${a}, Nova Scotia`;
  const res = await fetch(`${process.env.GEOCODE_BASE || "https://nominatim.openstreetmap.org"}/search?format=json&limit=1&countrycodes=ca&q=${encodeURIComponent(q)}`, {
    headers: { "User-Agent": "OCOTS-HQ/1.0 (oilchangeonthespot@gmail.com)" }, signal: AbortSignal.timeout(6000) }).catch(() => null);
  if (!res?.ok) return null;   // not cached: try again next time
  const [r] = (await res.json().catch(() => [])) as { lat: string; lon: string }[];
  const pt = r ? { lat: Number(r.lat), lng: Number(r.lon) } : null;
  await sbInsert("geo_cache", { key: k, lat: pt?.lat ?? null, lng: pt?.lng ?? null }, { upsertOn: "key" }).catch(() => null);
  return pt;
}

