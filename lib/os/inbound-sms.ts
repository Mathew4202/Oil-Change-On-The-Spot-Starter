// Texts customers send back to our Quo number. Pure parsing + keyword rules (tested in __tests__/inbound-sms.test.ts).
import crypto from "crypto";

export type Inbound = { eventId: string; messageId: string | null; from: string; to: string | null; text: string };

/** Works with both Quo webhook formats (current "2026-03-30" and the older OpenPhone "v2"). Returns null for anything that isn't an incoming text. */
export function parseQuoEvent(raw: unknown): Inbound | null {
  const e = (raw ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (e.type !== "message.received") return null;
  const d = e.data ?? {};
  if (d.object) {   // older format
    const o = d.object;
    if (o.direction && o.direction !== "incoming") return null;
    return o.from ? { eventId: String(e.id ?? o.id), messageId: o.id ?? null, from: String(o.from), to: Array.isArray(o.to) ? o.to[0] ?? null : o.to ?? null, text: String(o.body ?? o.text ?? "") } : null;
  }
  const r = d.resource ?? {}, c = d.context ?? {};
  const from = c.senderIdentifier ?? r.from;
  if (!from) return null;
  return { eventId: String(e.id ?? r.id), messageId: r.id ?? null, from: String(from), to: (c.recipientIdentifiers ?? [])[0] ?? null, text: String(r.text ?? r.body ?? "") };
}

// Standard opt-out words. "CANCEL" is left out on purpose: our customers say that about a booking, not the texts.
const STOP = /^(stop|stop all|stopall|stop texting( me)?|unsubscribe|end|quit|opt ?out|arret|arrêt|remove me)[.!\s]*$/i;
const START = /^(start|unstop|resume|opt ?in|subscribe)[.!\s]*$/i;
const CANCEL = /^(cancel|cancel (it|please|my (booking|appointment))|can i cancel\??)[.!\s]*$/i;

export type Intent = "stop" | "start" | "cancel" | "other";
export function intentOf(text: string): Intent {
  const t = text.trim().replace(/\s+/g, " ");
  if (STOP.test(t)) return "stop";
  if (START.test(t)) return "start";
  if (CANCEL.test(t)) return "cancel";
  return "other";
}

const safeEq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };

/** Check the webhook really came from Quo. Both signing schemes; secret is QUO_WEBHOOK_SECRET from the Quo webhook settings. */
export function verifyQuo(rawBody: Buffer, h: { id?: string | null; timestamp?: string | null; signature?: string | null; legacy?: string | null }, secret: string, nowMs = Date.now()) {
  if (!secret) return false;
  if (h.signature && h.id && h.timestamp) {
    const ts = Number(h.timestamp);
    if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > 300) return false;
    const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    const want = crypto.createHmac("sha256", key).update(Buffer.concat([Buffer.from(`${h.id}.${h.timestamp}.`), rawBody])).digest("base64");
    return h.signature.split(" ").some((p) => { const [v, s] = p.split(","); return v === "v1" && !!s && safeEq(s, want); });
  }
  if (h.legacy) {
    const key = Buffer.from(secret, "base64");
    return h.legacy.split(",").some((part) => {
      const [scheme, ver, ts, sig] = part.trim().split(";");
      if (scheme !== "hmac" || ver !== "1" || !ts || !sig) return false;
      const t = Number(ts); if (Number.isFinite(t) && Math.abs(nowMs - (t > 1e12 ? t : t * 1000)) > 300_000) return false;
      return safeEq(sig, crypto.createHmac("sha256", key).update(Buffer.concat([Buffer.from(`${ts}.`), rawBody])).digest("base64"));
    });
  }
  return false;
}
