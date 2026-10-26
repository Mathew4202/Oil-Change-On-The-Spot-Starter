// HQ login: a signed cookie. "Keep me signed in" lasts a year (staff: 30 days); otherwise 12 hours.
// Owners' passwords live in Vercel settings: OWNER_PASSWORDS = "mathew:somepassword,harsh:anotherpassword"
// Staff logins (front desk, technician, manager) are made in HQ (Team) and kept in the staff table, passwords hashed.
// The cookie says who and which role; the middleware checks every HQ page and action against roles.ts.
import crypto from "crypto";
import { cookies } from "next/headers";
import { isRole, type Role } from "@/lib/os/roles";

const COOKIE = "ocots_owner";
const DAYS = 365;
const secret = () => process.env.OWNER_SESSION_SECRET || process.env.ADMIN_SECRET || "";

function sign(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

export { ownerList, checkPassword } from "@/lib/os/owners";

export function sessionCookie(name: string, remember = true, role: Role = "owner", ver = 0) {
  const days = role === "owner" ? DAYS : 30;
  const ms = remember ? days * 86400000 : 12 * 3600000;
  const exp = Date.now() + ms;
  const payload = `${name}.${role}.${ver}.${exp}`;
  return { name: COOKIE, value: `${payload}.${sign(payload)}`,
    options: { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", ...(remember ? { maxAge: days * 86400 } : {}) } };
}

export type Staff = { name: string; role: Role; ver: number };

/** Who is signed in, and their role. Old owner cookies (name.exp.sig) still count as owners. */
export function currentStaff(): Staff | null {
  if (!secret()) return null;
  const v = cookies().get(COOKIE)?.value;
  if (!v) return null;
  const parts = v.split(".");
  let name: string, role: string, ver = 0, exp: string, sig: string, payload: string;
  if (parts.length === 3) { [name, exp, sig] = parts; role = "owner"; payload = `${name}.${exp}`; }
  else if (parts.length === 5) { [name, role, , exp, sig] = parts; ver = Number(parts[2]) || 0; payload = parts.slice(0, 4).join("."); }
  else return null;
  const good = sign(payload);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  if (Number(exp) < Date.now() || !isRole(role)) return null;
  return { name, role, ver };
}

/** The signed-in name ("mathew", "harsh", "teagan"…) for anyone with an HQ login, else null.
 *  What they may do is checked by the middleware (roles.ts); use isOwner() for owner-only details like profit. */
export function currentOwner(): string | null {
  return currentStaff()?.name ?? null;
}

export const isOwner = () => currentStaff()?.role === "owner";

export const COOKIE_NAME = COOKIE;

// --- staff passwords (scrypt, salted) ---
export function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16).toString("base64url");
  return `scrypt$${salt}$${crypto.scryptSync(pw, salt, 32).toString("base64url")}`;
}
export function passwordMatches(pw: string, stored: string | null | undefined) {
  const [kind, salt, hash] = String(stored || "").split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const got = crypto.scryptSync(pw, salt, 32);
  const want = Buffer.from(hash, "base64url");
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
/** Easy to read out loud and type on a phone: "maple-river-4821" style. */
export function newPassword() {
  const words = ["maple", "river", "harbour", "cedar", "stone", "ocean", "piston", "valve", "amber", "north", "spruce", "comet", "lobster", "anchor", "tide", "ember"];
  const pick = () => words[crypto.randomInt(words.length)];
  return `${pick()}-${pick()}-${crypto.randomInt(1000, 10000)}`;
}
