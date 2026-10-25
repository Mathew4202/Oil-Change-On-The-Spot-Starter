// Owner login: a signed cookie. "Keep me signed in" lasts a year; otherwise 12 hours. Passwords live in Vercel settings:
//   OWNER_PASSWORDS = "mathew:somepassword,harsh:anotherpassword"
import crypto from "crypto";
import { cookies } from "next/headers";

const COOKIE = "ocots_owner";
const DAYS = 365;
const secret = () => process.env.OWNER_SESSION_SECRET || process.env.ADMIN_SECRET || "";

function sign(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

export { ownerList, checkPassword } from "@/lib/os/owners";

export function sessionCookie(owner: string, remember = true) {
  const ms = remember ? DAYS * 86400000 : 12 * 3600000;
  const exp = Date.now() + ms;
  const payload = `${owner}.${exp}`;
  return { name: COOKIE, value: `${payload}.${sign(payload)}`,
    options: { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", ...(remember ? { maxAge: DAYS * 86400 } : {}) } };
}

/** Returns "mathew" / "harsh" when signed in, else null. */
export function currentOwner(): string | null {
  if (!secret()) return null;
  const v = cookies().get(COOKIE)?.value;
  if (!v) return null;
  const parts = v.split(".");
  if (parts.length !== 3) return null;
  const [owner, exp, sig] = parts;
  const good = sign(`${owner}.${exp}`);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  if (Number(exp) < Date.now()) return null;
  return owner;
}

export const COOKIE_NAME = COOKIE;
