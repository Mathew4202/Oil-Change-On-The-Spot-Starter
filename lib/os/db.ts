// Tiny Supabase REST helper for server routes (uses the secret key, never sent to browsers).
const URL_ = () => process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const KEY = () => process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export function sbHeaders(extra: Record<string, string> = {}) {
  const k = KEY();
  return { apikey: k, ...(k.startsWith("eyJ") ? { Authorization: `Bearer ${k}` } : {}), ...extra };
}

export async function sbGet<T = any>(path: string): Promise<T[]> {
  const res = await fetch(`${URL_()}/rest/v1/${path}`, { headers: sbHeaders(), cache: "no-store" });
  if (!res.ok) throw new Error(`Supabase ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

export const enc = encodeURIComponent;
