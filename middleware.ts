// Every HQ page and HQ action goes through here: a staff login only gets its own part (lib/os/roles.ts).
// Owners pass straight through. A staff login that was turned off, or changed in Team, is signed out right away.
import { NextRequest, NextResponse } from "next/server";
import { allowed } from "@/lib/os/roles";

export const config = { matcher: ["/owner/:path*", "/api/owner/:path*"] };

const OPEN = /^\/(owner\/login|owner\/manifest|api\/owner\/(login|logout))/;

async function verify(value: string) {
  const secret = process.env.OWNER_SESSION_SECRET || process.env.ADMIN_SECRET || "";
  if (!secret || !value) return null;
  const parts = value.split(".");
  let name: string, role: string, ver = 0, exp: string, sig: string, payload: string;
  if (parts.length === 3) { [name, exp, sig] = parts; role = "owner"; payload = `${name}.${exp}`; }
  else if (parts.length === 5) { [name, role, , exp, sig] = parts; ver = Number(parts[2]) || 0; payload = parts.slice(0, 4).join("."); }
  else return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  const good = btoa(String.fromCharCode(...mac)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  if (good.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < good.length; i++) diff |= good.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff || Number(exp) < Date.now()) return null;
  return { name, role, ver, legacy: parts.length === 3 };
}

/**
 * Staff logins: still on, same role, not reset since this cookie was made. A yes is remembered for a minute so every
 * tap doesn't wait on the database (turning a login off or changing its role still takes effect within a minute).
 */
const okUntil = new Map<string, number>();
async function stillValid(name: string, role: string, ver: number) {
  const key = `${name}|${role}|${ver}`;
  if ((okUntil.get(key) ?? 0) > Date.now()) return true;
  const ok = await checkStaff(name, role, ver);
  if (ok) { if (okUntil.size > 200) okUntil.clear(); okUntil.set(key, Date.now() + 60_000); } else okUntil.delete(key);
  return ok;
}
async function checkStaff(name: string, role: string, ver: number) {
  const base = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const k = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!base || !k) return false;
  const res = await fetch(`${base}/rest/v1/staff?select=active,role,session_ver&username=eq.${encodeURIComponent(name)}`, {
    headers: { apikey: k, ...(k.startsWith("eyJ") ? { Authorization: `Bearer ${k}` } : {}) }, cache: "no-store" }).catch(() => null);
  if (!res?.ok) return false;
  const [s] = (await res.json().catch(() => [])) as { active: boolean; role: string; session_ver: number }[];
  return !!s && s.active && s.role === role && (s.session_ver ?? 0) === ver;
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (OPEN.test(path)) return NextResponse.next();
  const s = await verify(req.cookies.get("ocots_owner")?.value || "");
  if (!s) return NextResponse.next();   // not signed in: each page and route sends them to sign in
  const isApi = path.startsWith("/api/");
  if (s.role !== "owner" && !(await stillValid(s.name, s.role, s.ver))) {
    const res = isApi ? NextResponse.json({ error: "Please sign in again" }, { status: 401 }) : NextResponse.redirect(new URL("/owner/login", req.url));
    res.cookies.set("ocots_owner", "", { path: "/", maxAge: 0 });
    return res;
  }
  if (allowed(s.role, path)) return NextResponse.next();
  return isApi ? NextResponse.json({ error: "Your login doesn't have access to this." }, { status: 403 }) : NextResponse.redirect(new URL("/owner", req.url));
}
