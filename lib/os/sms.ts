// Texts through Quo (api.quo.com). Every text is logged in `messages`, sent or not.
import { sbGet, sbInsert, enc } from "@/lib/os/db";
import { convergeEnv } from "@/lib/os/converge";
import { e164 } from "@/lib/os/booking";
export { fill, segments } from "@/lib/os/text";
import { plainText } from "@/lib/os/text";
import { signed } from "@/lib/os/signer";

export const DEFAULT_REVIEW_LINK = "https://g.page/r/Cc5AP8M9qC4MEAE/review";

export async function reviewLink(): Promise<string> {
  try {
    const [r] = await sbGet<{ value: string }>("app_secrets?select=value&key=eq.review_link");
    return (typeof r?.value === "string" && r.value) || DEFAULT_REVIEW_LINK;
  } catch { return DEFAULT_REVIEW_LINK; }
}

export async function template(key: string): Promise<string | null> {
  const [t] = await sbGet<{ body: string; active: boolean }>(`message_templates?select=body,active&key=eq.${enc(key)}`);
  return t && t.active ? t.body : null;
}

const payWording = (t: string) => (convergeEnv() ? t : t.replace(/\(card or e-transfer\)/g, "(by e-transfer)"));

/** force = the one reply confirming STOP/START; everything else respects "texts off". */
/** Texts about coming back (not about a booking they made): a customer can turn just these off. */
export const PROMO_KINDS = new Set(["oil_due", "fill_in"]);

export async function sendSms(to: string, contentIn: string, meta: { kind: string; customerId?: string | null; bookingId?: string | null; force?: boolean }) {
  const phone = e164(to);
  // signed by whoever is signed in to HQ (automatic texts: Mathew); until online card payments are set up (Converge),
  // pay links only offer e-transfer, so the text doesn't promise card
  const content = plainText(payWording(await signed(contentIn)));
  const key = process.env.QUO_API_KEY, from = process.env.QUO_FROM_NUMBER;
  let status = "sent", error: string | null = null, providerId: string | null = null;
  // Anyone who replied STOP (or was switched off in HQ) never gets an automatic text. Checked here so no path can skip it.
  const off = meta.force ? [] : await sbGet<{ id: string }>(`customers?select=id&sms_opt_out=eq.true&or=(${[meta.customerId ? `id.eq.${meta.customerId}` : "", `phone.eq.${enc(phone)}`].filter(Boolean).join(",")})&limit=1`).catch(() => []);
  // Reminder-only opt-out: no "oil change due" / "we're in your area" texts, everything else still goes
  const promoOff = !off.length && !meta.force && PROMO_KINDS.has(meta.kind)
    ? await sbGet<{ id: string }>(`customers?select=id&promo_off=eq.true&or=(${[meta.customerId ? `id.eq.${meta.customerId}` : "", `phone.eq.${enc(phone)}`].filter(Boolean).join(",")})&limit=1`).catch(() => [])
    : [];
  if (off.length) { status = "opted_out"; error = "Texts are off for this customer"; }
  else if (promoOff.length) { status = "opted_out"; error = "Reminder texts are off for this customer"; }
  else if (!key || !from) { status = "not_set_up"; error = "Add QUO_API_KEY and QUO_FROM_NUMBER in Vercel"; }
  else {
    try {
      const res = await fetch(`${process.env.QUO_BASE_URL || "https://api.quo.com"}/v1/messages`, {
        method: "POST", headers: { Authorization: key, "Content-Type": "application/json", "Quo-Api-Version": process.env.QUO_API_VERSION || "2026-03-30" },
        body: JSON.stringify({ content, from: e164(from), to: [phone] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { status = "failed"; error = `${res.status} ${JSON.stringify(body).slice(0, 200)}`; if (res.status === 402) await creditsOut(); }
      else providerId = body?.data?.id ?? null;
    } catch (e) { status = "failed"; error = String(e).slice(0, 200); }
  }
  await sbInsert("messages", { customer_id: meta.customerId ?? null, booking_id: meta.bookingId ?? null, channel: "sms", direction: "out",
    kind: meta.kind, body: content, status, error, to_phone: phone, provider_id: providerId });
  return { sent: status === "sent", status, error };
}

/** Quo's texting credits ran out (402): tell the owners once a day, so texts don't quietly stop for days. */
async function creditsOut() {
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/Halifax" });
  const key = `quo402:${day}`;
  const seen = await sbGet<{ type: string }>(`webhook_log?select=type&type=eq.${key}&limit=1`).catch(() => null);
  if (!seen || seen.length) return;
  await sbInsert("webhook_log", { type: key, body: { at: new Date().toISOString() } }).catch(() => null);
  const { pushToOwners } = await import("@/lib/os/push");
  await pushToOwners({ title: "Texts aren't sending: Quo credits ran out", body: "Top up the prepaid credits in Quo (Settings, Billing). Until then customers don't get reminders, bills or receipts by text.", url: "/owner/money" }).catch(() => null);
}
