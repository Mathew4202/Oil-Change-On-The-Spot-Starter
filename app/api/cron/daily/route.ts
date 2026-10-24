// Runs once a day (Vercel Cron, ~5-6 pm Halifax): day-before reminders + "oil change due" texts.
// Can also be run by hand: /api/cron/daily?key=ADMIN_SECRET
import { NextRequest, NextResponse } from "next/server";
import { sbGet, sbPatch } from "@/lib/os/db";
import { halifaxDate, halifaxToDate } from "@/lib/os/slots";
import { textCustomer, timeOnly, manageLink, siteUrl } from "@/lib/os/customer-texts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Who = { id: string; first_name: string | null; phone: string | null; sms_opt_out: boolean | null };

function allowed(req: NextRequest) {
  const cron = process.env.CRON_SECRET && req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  const manual = process.env.ADMIN_SECRET && req.nextUrl.searchParams.get("key") === process.env.ADMIN_SECRET;
  return cron || manual;
}

export async function GET(req: NextRequest) {
  if (!allowed(req)) return NextResponse.json({ error: "not allowed" }, { status: 401 });
  const today = halifaxDate(new Date());
  const tomorrow = halifaxDate(new Date(halifaxToDate(today, 36 * 60)));
  const rules = Object.fromEntries((await sbGet<{ key: string; value: number }>("pricing_rules?select=key,value")).map((x) => [x.key, Number(x.value)]));
  const out = { reminders: 0, reminderSkipped: 0, due: 0, dueSkipped: 0 };

  // 1) Day-before reminders
  const from = halifaxToDate(tomorrow, 0).toISOString(), to = halifaxToDate(tomorrow, 24 * 60).toISOString();
  const tomorrows = await sbGet<{ id: string; starts_at: string; address: string | null; manage_token: string | null; customers: Who | null;
    vehicles: { year: number | null; make: string | null; model: string | null } | null }>(
    `bookings?select=id,starts_at,address,manage_token,customers(id,first_name,phone,sms_opt_out),vehicles(year,make,model)` +
    `&status=in.(confirmed,requested)&reminder_sent_at=is.null&starts_at=gte.${from}&starts_at=lt.${to}`);
  for (const b of tomorrows) {
    const car = [b.vehicles?.year, b.vehicles?.make, b.vehicles?.model].filter(Boolean).join(" ") || "car";
    const r = await textCustomer("day_before", b.customers, { time: timeOnly(b.starts_at), car, address: b.address || "your address",
      manage_link: b.manage_token ? manageLink(b.manage_token) : "call or text 782-640-8341" }, b.id);
    if (r.sent) { out.reminders++; await sbPatch("bookings", `id=eq.${b.id}`, { reminder_sent_at: new Date().toISOString() }); } else out.reminderSkipped++;
  }

  // 2) Oil change due soon (latest job per car, nothing already booked)
  const until = new Date(halifaxToDate(today, 0).getTime() + (rules.due_reminder_days_before ?? 3) * 86400000).toISOString().slice(0, 10);
  const due = await sbGet<{ id: string; vehicle_id: string | null; customer_id: string | null; done_at: string; customers: Who | null;
    vehicles: { year: number | null; make: string | null; model: string | null } | null }>(
    `jobs?select=id,vehicle_id,customer_id,done_at,customers(id,first_name,phone,sms_opt_out),vehicles(year,make,model)` +
    `&due_reminder_sent_at=is.null&next_due_date=lte.${until}&next_due_date=gte.${addDays(today, -30)}&order=done_at.desc`);
  for (const j of due) {
    if (!j.vehicle_id || !j.customer_id) { out.dueSkipped++; continue; }
    const [newer] = await sbGet<{ id: string }>(`jobs?select=id&vehicle_id=eq.${j.vehicle_id}&done_at=gt.${j.done_at}&limit=1`);
    const [upcoming] = await sbGet<{ id: string }>(`bookings?select=id&customer_id=eq.${j.customer_id}&status=in.(confirmed,requested)&starts_at=gt.${new Date().toISOString()}&limit=1`);
    if (newer || upcoming) { out.dueSkipped++; await sbPatch("jobs", `id=eq.${j.id}`, { due_reminder_sent_at: new Date().toISOString() }); continue; }
    const car = [j.vehicles?.year, j.vehicles?.make, j.vehicles?.model].filter(Boolean).join(" ") || "car";
    const r = await textCustomer("oil_due", j.customers, { car, book_link: `${siteUrl()}/booking` });
    if (r.sent) { out.due++; await sbPatch("jobs", `id=eq.${j.id}`, { due_reminder_sent_at: new Date().toISOString() }); } else out.dueSkipped++;
  }
  return NextResponse.json({ ok: true, today, tomorrow, ...out });
}

function addDays(d: string, n: number) { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); }
