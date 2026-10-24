// Owner passwords from the OWNER_PASSWORDS setting (no Next.js imports, so it can be tested).
import crypto from "crypto";

/** Forgiving about spaces, quotes, capital letters in names, and ; or new lines between people. */
export function ownerList(): { name: string; password: string }[] {
  const raw = (process.env.OWNER_PASSWORDS || "").trim().replace(/^["']|["']$/g, "");
  return raw.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean).map((entry) => {
    const i = entry.search(/[:=]/);
    if (i < 0) return null;
    return { name: entry.slice(0, i).trim().replace(/^["']|["']$/g, "").toLowerCase(),
             password: entry.slice(i + 1).trim().replace(/^["']|["']$/g, "") };
  }).filter((x): x is { name: string; password: string } => !!x && !!x.name && !!x.password);
}

export function checkPassword(name: string, password: string): string | null {
  const pw = password.trim();
  for (const o of ownerList()) {
    if (o.name === name.trim().toLowerCase() && o.password.length === pw.length &&
        crypto.timingSafeEqual(Buffer.from(o.password), Buffer.from(pw))) return o.name;
  }
  return null;
}

