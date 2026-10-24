// "Text me a code" sign-in for customers. Pure helpers (tested in __tests__/login-code.test.ts).
import crypto from "crypto";

export const CODE_MINUTES = 10, MAX_TRIES = 5, MAX_CODES_PER_HOUR = 3, CUSTOMER_DAYS = 180;

export const newCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
export const hashCode = (secret: string, phone: string, code: string) => crypto.createHmac("sha256", secret).update(`login:${phone}:${code}`).digest("hex");
export const sameHash = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
export const codeText = (code: string) => `Your Oil Change On The Spot code is ${code}. It works for ${CODE_MINUTES} minutes. If you didn't ask for it, ignore this text. - Mathew`;

/** Customer session cookie value: <customerId>.<expiry>.<signature>. Signed differently from the owner cookie. */
export function signCustomer(secret: string, id: string, now = Date.now()) {
  const exp = now + CUSTOMER_DAYS * 86400000;
  const sig = crypto.createHmac("sha256", secret).update(`customer:${id}.${exp}`).digest("base64url");
  return `${id}.${exp}.${sig}`;
}
export function readCustomer(secret: string, v: string | undefined, now = Date.now()): string | null {
  if (!secret || !v) return null;
  const [id, exp, sig] = v.split(".");
  if (!id || !exp || !sig || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const want = crypto.createHmac("sha256", secret).update(`customer:${id}.${exp}`).digest("base64url");
  if (!sameHash(sig, want) || Number(exp) < now) return null;
  return id;
}
