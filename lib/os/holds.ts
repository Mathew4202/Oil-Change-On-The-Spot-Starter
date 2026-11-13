// Holding a time for a caller: the slot is blocked for everyone else until it expires,
// the caller gets a text with a link, and booking through that link turns the hold into a real booking.
import crypto from "crypto";
import { sbGet, sbInsert, sbPatch, enc } from "@/lib/os/db";
import { sendSms, template, fill } from "@/lib/os/sms";
import { siteUrl, when as whenText, timeOnly } from "@/lib/os/customer-texts";
import { jobMinutes } from "@/lib/os/calendar";

const e164 = (p: string) => { const d = p.replace(/\D/g, ""); return d.length === 10 ? `+1${d}` : `+${d}`; };

export type Hold = { id: string; token: string; starts_at: string; ends_at: string; expires_at: string; first_name: string | null; phone: string | null;
  job: string; cars: number; note: string | null; created_by: string | null; status: string; booking_id: string | null;
  car_year?: number | null; car_make?: string | null; car_model?: string | null };
const COLS = "*";
export const JOBS = ["oil_change", "seasonal", "tires", "rotation", "parts", "diagnostic"] as const;

export const holdLink = (token: string) => `${siteUrl()}/booking?hold=${token}`;

/** Active holds that overlap a time range (the calendar and the open-times check both use this). */
export async function activeHolds(fromIso: string, toIso: string): Promise<Hold[]> {
  try {
    return await sbGet<Hold>(`slot_holds?select=${COLS}&status=eq.held&expires_at=gt.${new Date().toISOString()}&starts_at=lt.${toIso}&ends_at=gt.${fromIso}&order=starts_at`);
  } catch { return []; }   // migration 0023 not run yet
}

export async function holdByToken(token: string): Promise<Hold | null> {
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) return null;
  const [h] = await sbGet<Hold>(`slot_holds?select=${COLS}&token=eq.${enc(token)}`).catch(() => []);
  return h ?? null;
}
export const holdIsLive = (h: Hold | null) => !!h && h.status === "held" && new Date(h.expires_at).getTime() > Date.now();

/** Add-ons picked when the link was sent ride along in the note, as "[addons:cabin_filter,wipers]". */
export const ADDON_TAG = /\[addons:([a-z_,]+)\]/;
export const holdAddons = (note: string | null | undefined) => (ADDON_TAG.exec(note ?? "")?.[1] ?? "").split(",").filter(Boolean);

export async function createHold(input: { start: string; firstName?: string; phone: string; job?: string; cars?: number; hours?: number; note?: string; addons?: string[]; existing?: boolean }, owner: string) {
  const start = new Date(input.start);
  if (isNaN(start.getTime()) || start.getTime() < Date.now() - 5 * 60000) return { ok: false as const, error: "Pick a time in the future." };
  if (input.phone.replace(/\D/g, "").length < 10) return { ok: false as const, error: "Add their 10-digit mobile number so the link can be texted." };
  const job = (JOBS as readonly string[]).includes(input.job || "") ? input.job! : "oil_change";
  const cars = Math.min(4, Math.max(1, Math.round(input.cars || 1)));
  const rules = Object.fromEntries((await sbGet<{ key: string; value: number }>("pricing_rules?select=key,value")).map((x) => [x.key, Number(x.value)]));
  const OK = ["wipers", "cabin_filter", "engine_filter", "battery", "coolant", "washer_fluid", "tires"];
  const addons = (input.addons ?? []).filter((a) => OK.includes(a));
  const end = new Date(start.getTime() + jobMinutes(job, rules, addons as never) * cars * 60000);
  // nothing else may be booked or held in that time
  const [clash] = await sbGet<{ id: string }>(`bookings?select=id&status=in.(requested,confirmed,in_progress)&starts_at=lt.${end.toISOString()}&ends_at=gt.${start.toISOString()}&limit=1`);
  if (clash) return { ok: false as const, error: "That time overlaps a booking. Pick another time." };
  if ((await activeHolds(start.toISOString(), end.toISOString())).length) return { ok: false as const, error: "That time is already held for someone else." };
  const hours = Math.min(48, Math.max(0.5, Number(input.hours) || 2));
  // never hold past the appointment itself
  const expires = new Date(Math.min(Date.now() + hours * 3600000, start.getTime() - 30 * 60000));
  if (expires.getTime() <= Date.now()) return { ok: false as const, error: "That's too soon to hold. Book them directly instead." };
  const token = crypto.randomBytes(15).toString("base64url");
  const r = await sbInsert<Hold>("slot_holds", { token, starts_at: start.toISOString(), ends_at: end.toISOString(), expires_at: expires.toISOString(),
    first_name: (input.firstName || "").trim().slice(0, 40) || null, phone: e164(input.phone), job, cars, note: [(input.note || "").trim().slice(0, 260), addons.length ? `[addons:${addons.join(",")}]` : ""].filter(Boolean).join(" ") || null, created_by: owner });
  if (!r.ok || !r.data) return { ok: false as const, error: "Couldn't save the hold." };
  const sms = await textHold(r.data, input.existing);
  return { ok: true as const, hold: r.data, sms, link: holdLink(token) };
}

export async function textHold(h: Hold, existing = false) {
  // a customer we already have (sent from their page): no "thanks for calling", their details are already in the link
  const body = existing ? "Hi {first_name}, I'm holding {when} for your {service}. Tap here to confirm, your details are already filled in: {link}\nI'll keep the time until {until}.\n- {signer}, Oil Change On The Spot"
    : await template("hold_link");
  if (!body || !h.phone) return { sent: false, status: "template_off" };
  const [c] = await sbGet<{ id: string }>(`customers?select=id&phone=eq.${enc(h.phone)}`);
  const { serviceName } = await import("@/lib/os/hold-nudge-plan");
  const { signed } = await import("@/lib/os/signer");
  const text = fill(body, { first_name: h.first_name || "there", when: whenText(h.starts_at), link: holdLink(h.token), service: serviceName(h.job),
    // "11:15 am" when it runs out today, "tomorrow at 9:00 am" or the date when it's later
    until: new Date(h.expires_at).toLocaleDateString("en-CA", { timeZone: "America/Halifax" }) === new Date().toLocaleDateString("en-CA", { timeZone: "America/Halifax" }) ? timeOnly(h.expires_at) : whenText(h.expires_at) });
  return sendSms(h.phone, existing ? await signed(text) : text,
    { kind: "hold_link", customerId: c?.id ?? null });
}

export async function releaseHold(id: string) {
  return sbPatch("slot_holds", `id=eq.${enc(id)}&status=eq.held`, { status: "released" });
}

/** Booked through the link: the hold is done. */
export async function useHold(token: string, bookingId: string) {
  await sbPatch("slot_holds", `token=eq.${enc(token)}&status=eq.held`, { status: "booked", booking_id: bookingId }).catch(() => null);
}
