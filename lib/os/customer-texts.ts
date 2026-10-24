// Texts to customers around a booking. Uses the editable wording in message_templates.
import crypto from "crypto";
import { sbGet } from "@/lib/os/db";
import { sendSms, template, fill } from "@/lib/os/sms";
import { PHONE } from "@/lib/os/business";

const TZ = "America/Halifax";
export const siteUrl = () => process.env.SITE_URL || (process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://oilchangeonthespot.ca");
export const newManageToken = () => crypto.randomBytes(15).toString("base64url");
export const manageLink = (token: string) => `${siteUrl()}/b/${token}`;
export const payLink = (receiptToken: string) => `${siteUrl()}/pay/${receiptToken}`;
export const when = (iso: string) => new Date(iso).toLocaleString("en-CA", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).replace(/\./g, "").replace(/,(?=[^,]*$)/, " at");
export const timeOnly = (iso: string) => new Date(iso).toLocaleTimeString("en-CA", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).replace(/\./g, "");
const money = (n: number) => `$${n.toFixed(2)}`;

type Who = { id: string; first_name: string | null; phone: string | null; sms_opt_out?: boolean | null };

export async function textCustomer(key: string, who: Who | null | undefined, vars: Record<string, string>, bookingId?: string | null) {
  if (!who?.phone) return { sent: false, status: "no_phone" };
  if (who.sms_opt_out) return { sent: false, status: "opted_out" };
  const body = await template(key);
  if (!body) return { sent: false, status: "template_off" };
  return sendSms(who.phone, fill(body, { first_name: who.first_name?.trim() || "there", phone: PHONE, ...vars }), { kind: key, customerId: who.id, bookingId });
}

/** Booking confirmation (sent right after any booking, website or phone). */
export async function sendBookingConfirmation(bookingId: string, opts: { payingNow?: boolean } = {}) {
  const [b] = await sbGet<{ id: string; starts_at: string; address: string | null; quoted_total: number | null; manage_token: string | null; pay_mode: string;
    customers: Who | null; vehicles: { year: number | null; make: string | null; model: string | null } | null }>(
    `bookings?select=id,starts_at,address,quoted_total,manage_token,pay_mode,customers(id,first_name,phone,sms_opt_out),vehicles(year,make,model)&id=eq.${bookingId}`);
  if (!b) return { sent: false, status: "not_found" };
  const car = [b.vehicles?.year, b.vehicles?.make, b.vehicles?.model].filter(Boolean).join(" ") || "your car";
  return textCustomer("booking_confirmation", b.customers, {
    when: when(b.starts_at), car, address: b.address || "your address", total: money(Number(b.quoted_total ?? 0)),
    manage_link: b.manage_token ? manageLink(b.manage_token) : `call or text ${PHONE}`,
    pay_note: b.pay_mode === "online" ? ", paid online" : opts.payingNow ? ", pay online now or after the job" : ", paid after the job",
  }, b.id);
}
