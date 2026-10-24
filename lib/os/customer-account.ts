// Customer accounts: send/check the text code, the session cookie, and what a signed-in customer sees.
import { cookies } from "next/headers";
import { sbGet, sbInsert, sbPatch, enc } from "@/lib/os/db";
import { e164 } from "@/lib/os/booking";
import { sendSms } from "@/lib/os/sms";
import { when } from "@/lib/os/customer-texts";
import { newCode, hashCode, sameHash, codeText, signCustomer, readCustomer, CODE_MINUTES, MAX_TRIES, MAX_CODES_PER_HOUR, CUSTOMER_DAYS } from "@/lib/os/login-code";

export const CUSTOMER_COOKIE = "ocots_customer";
const secret = () => process.env.OWNER_SESSION_SECRET || process.env.ADMIN_SECRET || "";
const tenDigits = (p: string) => { const d = p.replace(/\D/g, ""); return d.length === 10 || (d.length === 11 && d.startsWith("1")); };

export async function sendCode(rawPhone: string): Promise<{ ok: boolean; error?: string }> {
  if (!tenDigits(rawPhone)) return { ok: false, error: "Enter your 10-digit mobile number." };
  if (!secret()) return { ok: false, error: "Sign-in isn't set up yet." };
  const phone = e164(rawPhone);
  const recent = await sbGet<{ id: string }>(`login_codes?select=id&phone=eq.${enc(phone)}&created_at=gte.${new Date(Date.now() - 3600000).toISOString()}`);
  if (recent.length >= MAX_CODES_PER_HOUR) return { ok: false, error: "That's a lot of codes. Try again in an hour, or call or text 782-640-8341." };
  const [c] = await sbGet<{ id: string }>(`customers?select=id&phone=eq.${enc(phone)}&limit=1`);
  // Same answer either way, so nobody can use this to check who our customers are
  if (!c) return { ok: true };
  const code = newCode();
  await sbInsert("login_codes", { phone, code_hash: hashCode(secret(), phone, code), expires_at: new Date(Date.now() + CODE_MINUTES * 60000).toISOString() });
  await sendSms(phone, codeText(code), { kind: "login_code", customerId: c.id });   // respects STOP like every other text
  return { ok: true };
}

export async function checkCode(rawPhone: string, code: string): Promise<{ ok: boolean; customerId?: string; error?: string }> {
  if (!tenDigits(rawPhone) || !/^\d{6}$/.test(code.trim())) return { ok: false, error: "Enter the 6-digit code from the text." };
  const phone = e164(rawPhone);
  const [row] = await sbGet<{ id: string; code_hash: string; attempts: number }>(
    `login_codes?select=id,code_hash,attempts&phone=eq.${enc(phone)}&used_at=is.null&expires_at=gt.${new Date().toISOString()}&order=created_at.desc&limit=1`);
  if (!row) return { ok: false, error: "That code has expired. Tap \"Send a new code\"." };
  if (row.attempts >= MAX_TRIES) return { ok: false, error: "Too many wrong tries. Tap \"Send a new code\"." };
  if (!sameHash(row.code_hash, hashCode(secret(), phone, code.trim()))) {
    await sbPatch("login_codes", `id=eq.${row.id}`, { attempts: row.attempts + 1 });
    return { ok: false, error: `That code isn't right. ${MAX_TRIES - row.attempts - 1} tries left.` };
  }
  await sbPatch("login_codes", `id=eq.${row.id}`, { used_at: new Date().toISOString() });
  const [c] = await sbGet<{ id: string }>(`customers?select=id&phone=eq.${enc(phone)}&limit=1`);
  if (!c) return { ok: false, error: "We couldn't find your bookings. Please call or text 782-640-8341." };
  await sbPatch("customers", `id=eq.${c.id}`, { account_opt_in: true });
  return { ok: true, customerId: c.id };
}

export const customerCookie = (id: string) => ({ name: CUSTOMER_COOKIE, value: signCustomer(secret(), id),
  options: { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: CUSTOMER_DAYS * 86400 } });
export const currentCustomer = () => readCustomer(secret(), cookies().get(CUSTOMER_COOKIE)?.value);

export type Profile = { name: string; phone: string; email: string; address: string;
  cars: { year: string; make: string; model: string; engine: string }[];
  upcoming: { when: string; car: string; total: number | null; manage: string | null }[] };

export async function profileFor(id: string): Promise<Profile | null> {
  const [[c], vehicles, books] = await Promise.all([
    sbGet<{ first_name: string | null; last_name: string | null; phone: string | null; email: string | null; address: string | null }>(`customers?select=first_name,last_name,phone,email,address&id=eq.${enc(id)}`),
    sbGet<{ year: number | null; make: string | null; model: string | null; engine: string | null }>(`vehicles?select=year,make,model,engine&customer_id=eq.${enc(id)}&order=created_at.desc&limit=10`),
    sbGet<{ starts_at: string; quoted_total: number | null; manage_token: string | null; status: string; vehicles: { year: number | null; make: string | null; model: string | null } | null }>(
      `bookings?select=starts_at,quoted_total,manage_token,status,vehicles(year,make,model)&customer_id=eq.${enc(id)}&starts_at=gte.${new Date().toISOString()}&status=in.(confirmed,requested)&order=starts_at.asc&limit=5`),
  ]);
  if (!c) return null;
  const seen = new Set<string>();
  const cars = vehicles.filter((v) => v.year && v.make && v.model).filter((v) => { const k = `${v.year}${v.make}${v.model}`.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 5).map((v) => ({ year: String(v.year), make: v.make!, model: v.model!, engine: v.engine ?? "" }));
  const d = (c.phone ?? "").replace(/\D/g, "").slice(-10);
  return {
    name: [c.first_name, c.last_name].filter(Boolean).join(" "), phone: d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : "",
    email: c.email ?? "", address: c.address ?? "", cars,
    upcoming: books.map((b) => ({ when: when(b.starts_at), car: [b.vehicles?.year, b.vehicles?.make, b.vehicles?.model].filter(Boolean).join(" "),
      total: b.quoted_total, manage: b.manage_token ? `/b/${b.manage_token}` : null })),
  };
}
