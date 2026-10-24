// Texts through Quo (api.quo.com). Every text is logged in `messages`, sent or not.
import { sbGet, sbInsert, enc } from "@/lib/os/db";
import { e164 } from "@/lib/os/booking";
export { fill, segments } from "@/lib/os/text";

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

/** force = the one reply confirming STOP/START; everything else respects "texts off". */
export async function sendSms(to: string, content: string, meta: { kind: string; customerId?: string | null; bookingId?: string | null; force?: boolean }) {
  const phone = e164(to);
  const key = process.env.QUO_API_KEY, from = process.env.QUO_FROM_NUMBER;
  let status = "sent", error: string | null = null, providerId: string | null = null;
  // Anyone who replied STOP (or was switched off in HQ) never gets an automatic text. Checked here so no path can skip it.
  const off = meta.force ? [] : await sbGet<{ id: string }>(`customers?select=id&sms_opt_out=eq.true&or=(${[meta.customerId ? `id.eq.${meta.customerId}` : "", `phone.eq.${enc(phone)}`].filter(Boolean).join(",")})&limit=1`).catch(() => []);
  if (off.length) { status = "opted_out"; error = "Texts are off for this customer"; }
  else if (!key || !from) { status = "not_set_up"; error = "Add QUO_API_KEY and QUO_FROM_NUMBER in Vercel"; }
  else {
    try {
      const res = await fetch(`${process.env.QUO_BASE_URL || "https://api.quo.com"}/v1/messages`, {
        method: "POST", headers: { Authorization: key, "Content-Type": "application/json" },
        body: JSON.stringify({ content, from: e164(from), to: [phone] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { status = "failed"; error = `${res.status} ${JSON.stringify(body).slice(0, 200)}`; }
      else providerId = body?.data?.id ?? null;
    } catch (e) { status = "failed"; error = String(e).slice(0, 200); }
  }
  await sbInsert("messages", { customer_id: meta.customerId ?? null, booking_id: meta.bookingId ?? null, channel: "sms", direction: "out",
    kind: meta.kind, body: content, status, error, to_phone: phone, provider_id: providerId });
  return { sent: status === "sent", status, error };
}
