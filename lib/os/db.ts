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

export async function sbInsert<T = any>(table: string, row: object, opts: { upsertOn?: string } = {}): Promise<{ ok: boolean; status: number; data?: T; error?: any }> {
  const q = opts.upsertOn ? `?on_conflict=${opts.upsertOn}` : "";
  const res = await fetch(`${URL_()}/rest/v1/${table}${q}`, {
    method: "POST",
    headers: sbHeaders({
      "Content-Type": "application/json",
      Prefer: `return=representation${opts.upsertOn ? ",resolution=merge-duplicates" : ""}`,
    }),
    body: JSON.stringify(row),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, status: res.status, error: body };
  return { ok: true, status: res.status, data: Array.isArray(body) ? body[0] : body };
}
