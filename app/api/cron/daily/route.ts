// Runs once a day (Vercel Cron, ~5-6 pm Halifax): day-before reminders + "oil change due" texts.
// Can also be run by hand: /api/cron/daily?key=ADMIN_SECRET
import { runPlanBilling } from "@/lib/os/plans";
import { backfillSpecs } from "@/lib/os/spec-backfill";
import { attachUpcoming } from "@/lib/os/spec-learn";
import { offerRouteMoves, closeRouteOffers } from "@/lib/os/route";
import { fillSlowDay } from "@/lib/os/fill-ins";
import { backupNow } from "@/lib/os/backup";
import { syncSquare, squareReady } from "@/lib/os/square-sync";
import { chargeLateBills } from "@/lib/os/bills";
import { lastVisit, lastVisitText } from "@/lib/os/last-visit";
import { NextRequest, NextResponse } from "next/server";
import { sbGet, sbPatch, sbDelete } from "@/lib/os/db";
import { halifaxDate, halifaxToDate } from "@/lib/os/slots";
import { textCustomer, timeOnly, manageLink, siteUrl } from "@/lib/os/customer-texts";
import { PHONE } from "@/lib/os/business";

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
  const tomorrows = await sbGet<{ id: string; starts_at: string; address: string | null; manage_token: string | null; vehicle_id: string | null; customers: Who | null;
    vehicles: { year: number | null; make: string | null; model: string | null } | null }>(
    `bookings?select=id,starts_at,address,manage_token,vehicle_id,customers(id,first_name,phone,sms_opt_out),vehicles(year,make,model)` +
    `&status=in.(confirmed,requested)&reminder_sent_at=is.null&starts_at=gte.${from}&starts_at=lt.${to}` +
    `&or=(source.is.null,source.neq.square_import)`);   // booked in Square: Square reminds them (HQ can't move a Square booking)
  for (const b of tomorrows) {
    const car = [b.vehicles?.year, b.vehicles?.make, b.vehicles?.model].filter(Boolean).join(" ") || "car";
    // what we flagged on this car last time ("tires coming up soon"), so they can add it to tomorrow's visit
    const [prev] = b.vehicle_id ? await sbGet<{ inspection: Record<string, { status?: string }> | null; customer_note?: string | null }>(
      `jobs?select=*&vehicle_id=eq.${b.vehicle_id}&order=done_at.desc&limit=1`).catch(() => []) : [];
    const r = await textCustomer("day_before", b.customers, { time: timeOnly(b.starts_at), car, address: b.address || "your address",
      manage_link: b.manage_token ? manageLink(b.manage_token) : `call or text ${PHONE}` }, b.id, prev ? lastVisitText(lastVisit(prev.inspection, prev.customer_note)) : "");
    if (r.sent) { out.reminders++; await sbPatch("bookings", `id=eq.${b.id}`, { reminder_sent_at: new Date().toISOString() }); } else out.reminderSkipped++;
  }

  // 2) Oil change due soon (latest job per car, nothing already booked)
  const until = new Date(halifaxToDate(today, 0).getTime() + (rules.due_reminder_days_before ?? 3) * 86400000).toISOString().slice(0, 10);
  const due = await sbGet<{ id: string; vehicle_id: string | null; customer_id: string | null; done_at: string; inspection: Record<string, { status?: string }> | null; customer_note?: string | null; customers: Who | null;
    vehicles: { year: number | null; make: string | null; model: string | null; fleet_account_id: string | null } | null }>(
    `jobs?select=*,customers(id,first_name,phone,sms_opt_out),vehicles(year,make,model,fleet_account_id)` +
    `&due_reminder_sent_at=is.null&next_due_date=lte.${until}&next_due_date=gte.${addDays(today, -30)}&order=done_at.desc`);
  for (const j of due) {
    if (!j.vehicle_id || !j.customer_id || j.vehicles?.fleet_account_id) { out.dueSkipped++; continue; }   // fleets: due list is on the Fleets screen
    const [newer] = await sbGet<{ id: string }>(`jobs?select=id&vehicle_id=eq.${j.vehicle_id}&done_at=gt.${j.done_at}&limit=1`);
    const [upcoming] = await sbGet<{ id: string }>(`bookings?select=id&customer_id=eq.${j.customer_id}&status=in.(confirmed,requested)&starts_at=gt.${new Date().toISOString()}&limit=1`);
    if (newer || upcoming) { out.dueSkipped++; await sbPatch("jobs", `id=eq.${j.id}`, { due_reminder_sent_at: new Date().toISOString() }); continue; }
    const car = [j.vehicles?.year, j.vehicles?.make, j.vehicles?.model].filter(Boolean).join(" ") || "car";
    const r = await textCustomer("oil_due", j.customers, { car, book_link: `${siteUrl()}/booking` }, null, lastVisitText(lastVisit(j.inspection, j.customer_note)));
    if (r.sent) { out.due++; await sbPatch("jobs", `id=eq.${j.id}`, { due_reminder_sent_at: new Date().toISOString() }); } else out.dueSkipped++;
  }
  // 3) Maintenance plans: this month's pay link on each plan's bill day, and plans that finished their year
  const plans = await runPlanBilling(today).catch(() => ({ billed: 0, ended: 0 }));
  // 4) A couple of cars we've done get their oil approval filled in (under the daily lookup cap)
  const specs = await backfillSpecs(2).catch(() => ({ filled: 0 }));
  // 4b) Bookings in the next few days still without the oil on file: look them up again and attach it
  const oilAttached = await attachUpcoming(4).catch(() => 0);
  // 4c) Two evenings before a day, and again the evening before (jobs booked since): offer better times to jobs that
  //     zig-zag across town, sit in rush hour far from home, or leave a big empty stretch (they say yes or no)
  await closeRouteOffers().catch(() => 0);
  // 4d) pay-later bills past due: the late fee once, then interest every 30 days (and a text with the new amount)
  const late = await chargeLateBills().catch((e) => ({ charged: 0, note: String(e).slice(0, 120) }));   // trades nobody finished answering: whoever said yes keeps their time
  const route = {
    tomorrow: await offerRouteMoves(tomorrow).catch((e) => ({ offered: 0, note: String(e).slice(0, 120) })),
    dayAfter: await offerRouteMoves(addDays(today, 2)).catch((e) => ({ offered: 0, note: String(e).slice(0, 120) })),
  };
  // 4e) Two days out with open times: text a few customers coming due who live near the jobs already booked
  const fillIns = await fillSlowDay(addDays(today, 2), today).catch((e) => ({ texted: 0, note: String(e).slice(0, 120) }));
  // 4e2) Until the switchover: appointments and customers booked in Square come into HQ
  const square = squareReady() && (rules.square_sync ?? 1) !== 0 ? await syncSquare(new Date(Date.now() - 3 * 86400000), new Date(Date.now() + 60 * 86400000)).catch((e) => ({ ok: false, note: String(e).slice(0, 120) })) : null;
  // 4f) Sunday evening: email a backup of everything to the business inbox
  const backup = new Date().toLocaleDateString("en-CA", { timeZone: "America/Halifax", weekday: "short" }) === "Sun" || req.nextUrl.searchParams.get("backup") === "1"
    ? await backupNow().catch((e) => ({ sent: false, reason: String(e).slice(0, 120) })) : null;
  // 5) What Quo sent us is only kept two weeks
  await sbDelete("webhook_log", `at=lt.${new Date(Date.now() - 14 * 86400000).toISOString()}`).catch(() => null);
  return NextResponse.json({ ok: true, today, tomorrow, ...out, planBills: plans.billed, plansEnded: plans.ended, specsFilled: specs.filled, oilAttached, route, late, fillIns, backup, square });
}

function addDays(d: string, n: number) { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); }
