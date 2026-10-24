// Owner login: a signed cookie that lasts 60 days. Passwords live in Vercel settings:
//   OWNER_PASSWORDS = "mathew:somepassword,harsh:anotherpassword"
import crypto from "crypto";
import { cookies } from "next/headers";

const COOKIE = "ocots_owner";
const DAYS = 60;
const secret = () => process.env.OWNER_SESSION_SECRET || process.env.ADMIN_SECRET || "";

function sign(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function checkPassword(name: string, password: string): string | null {
  const list = (process.env.OWNER_PASSWORDS || "").split(",").map((x) => x.trim()).filter(Boolean);
  for (const entry of list) {
    const i = entry.indexOf(":");
    const n = entry.slice(0, i).trim().toLowerCase(), p = entry.slice(i + 1);
    if (n === name.trim().toLowerCase() && p.length > 0 && p.length === password.length &&
        crypto.timingSafeEqual(Buffer.from(p), Buffer.from(password))) return n;
  }
  return null;
}

export function sessionCookie(owner: string) {
  const exp = Date.now() + DAYS * 86400000;
  const payload = `${owner}.${exp}`;
  return { name: COOKIE, value: `${payload}.${sign(payload)}`,
    options: { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: DAYS * 86400 } };
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
