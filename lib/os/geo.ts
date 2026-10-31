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


/** Map points already in the cache (no new lookups), for many addresses at once. */
export async function cachedPoints(addresses: (string | null | undefined)[]): Promise<Map<string, Pt>> {
  const keys = [...new Set(addresses.filter((a): a is string => !!a && a.trim().length >= 6).map((a) => norm(a.trim())))];
  const out = new Map<string, Pt>();
  for (let i = 0; i < keys.length; i += 80) {
    const part = keys.slice(i, i + 80).map((k) => `"${k.replace(/"/g, "")}"`).join(",");
    const rows = await sbGet<{ key: string; lat: number | null; lng: number | null }>(`geo_cache?select=key,lat,lng&key=in.(${encodeURIComponent(part)})`).catch(() => []);
    for (const r of rows) if (r.lat != null && r.lng != null) out.set(r.key, { lat: Number(r.lat), lng: Number(r.lng) });
  }
  return out;
}
export const geoKey = (a: string) => norm(a.trim());
