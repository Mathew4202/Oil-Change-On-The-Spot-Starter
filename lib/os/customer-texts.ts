// Texts to customers around a booking. Uses the editable wording in message_templates.
import crypto from "crypto";
import { sbGet } from "@/lib/os/db";
import { sendSms, template, fill } from "@/lib/os/sms";

const TZ = "America/Halifax";
export const siteUrl = () => process.env.SITE_URL || (process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://oilchangeonthespot.ca");
export const newManageToken = () => crypto.randomBytes(15).toString("base64url");
export const manageLink = (token: string) => `${siteUrl()}/b/${token}`;
export const when = (iso: string) => new Date(iso).toLocaleString("en-CA", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).replace(/\./g, "").replace(/,(?=[^,]*$)/, " at");
export const timeOnly = (iso: string) => new Date(iso).toLocaleTimeString("en-CA", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).replace(/\./g, "");
const money = (n: number) => `$${n.toFixed(2)}`;

type Who = { id: string; first_name: string | null; phone: string | null; sms_opt_out?: boolean | null };

export async function textCustomer(key: string, who: Who | null | undefined, vars: Record<string, string>, bookingId?: string | null) {
  if (!who?.phone) return { sent: false, status: "no_phone" };
  if (who.sms_opt_out) return { sent: false, status: "opted_out" };
  const body = await template(key);
  if (!body) return { sent: false, status: "template_off" };
  return sendSms(who.phone, fill(body, { first_name: who.first_name?.trim() || "there", ...vars }), { kind: key, customerId: who.id, bookingId });
}

/** Booking confirmation (sent right after any booking, website or phone). */
export async function sendBookingConfirmation(bookingId: string) {
  const [b] = await sbGet<{ id: string; starts_at: string; address: string | null; quoted_total: number | null; manage_token: string | null; pay_mode: string;
    customers: Who | null; vehicles: { year: number | null; make: string | null; model: string | null } | null }>(
    `bookings?select=id,starts_at,address,quoted_total,manage_token,pay_mode,customers(id,first_name,phone,sms_opt_out),vehicles(year,make,model)&id=eq.${bookingId}`);
  if (!b) return { sent: false, status: "not_found" };
  const car = [b.vehicles?.year, b.vehicles?.make, b.vehicles?.model].filter(Boolean).join(" ") || "your car";
  return textCustomer("booking_confirmation", b.customers, {
    when: when(b.starts_at), car, address: b.address || "your address", total: money(Number(b.quoted_total ?? 0)),
    manage_link: b.manage_token ? manageLink(b.manage_token) : "call or text 782-640-8341",
  }, b.id);
}
