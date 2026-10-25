// Maintenance plan members: offer (terms by text) → I AGREE → active, monthly pay link, visits covered when booking.
import crypto from "crypto";
import { sbGet, sbInsert, sbPatch, sbPatchRows, sbRpc, enc } from "@/lib/os/db";
import { sendSms, template, fill } from "@/lib/os/sms";
import { siteUrl } from "@/lib/os/customer-texts";
import { pushToOwners } from "@/lib/os/push";
import { halifaxDate } from "@/lib/os/slots";
import { planDates, monthStart, oilLeft } from "@/lib/os/plan-cover";

const r2 = (n: number) => Math.round(n * 100) / 100;
const e164 = (p: string) => { const d = p.replace(/\D/g, ""); return d.length === 10 ? `+1${d}` : `+${d}`; };
const money = (n: number) => `$${Number(n).toFixed(2)}`;
const monthName = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-CA", { month: "long", year: "numeric", timeZone: "UTC" });

export type Plan = { id: string; customer_id: string | null; vehicle_id: string | null; request_id: string | null; name: string | null; phone: string; car: string | null; status: string;
  visits_per_year: number; swaps_per_year: number; per_visit: number; swap_price: number; monthly: number; hst_rate: number; offered_at: string | null; agreed_at: string | null;
  starts_on: string | null; ends_on: string | null; bill_day: number | null; notes: string | null };
export type Bill = { id: string; plan_id: string; period: string; subtotal: number; hst: number; total: number; token: string; status: string; sent_at: string | null; paid_at: string | null; method: string | null };

async function alertOwners(title: string, body: string, tag: string) {
  try { await sbInsert("notifications", { kind: "plan", title, body }); } catch { /* best effort */ }
  await Promise.race([pushToOwners({ title, body, url: "/owner/plans", tag }).catch(() => null), new Promise((r) => setTimeout(r, 4000))]);
}
const first = (p: { name: string | null }) => (p.name || "").trim().split(/\s+/)[0] || "there";

/** Send the plan terms by text. From a website request, or set up by hand. */
export async function offerPlan(input: { requestId?: string; name?: string; phone?: string; car?: string; visits?: number; swaps?: number; perVisit?: number; swapPrice?: number }, owner: string) {
  let row: Partial<Plan> & { request_id?: string | null };
  if (input.requestId) {
    const [q] = await sbGet<{ id: string; customer_name: string; phone: string; car: string; visits: number; swaps: number; monthly: number;
      breakdown: { plan?: { perVisit: number; swapPrice: number; visits: number; swaps: number; monthly: number; hst: number } } | null }>(`plan_requests?select=*&id=eq.${enc(input.requestId)}`);
    if (!q) return { ok: false as const, error: "Request not found" };
    const p = q.breakdown?.plan;
    row = { request_id: q.id, name: q.customer_name, phone: q.phone, car: q.car, visits_per_year: q.visits, swaps_per_year: q.swaps,
      per_visit: p?.perVisit ?? r2((q.monthly * 12) / Math.max(1, q.visits)), swap_price: p?.swapPrice ?? 0, monthly: Number(q.monthly) };
  } else {
    if (!input.phone || input.phone.replace(/\D/g, "").length < 10) return { ok: false as const, error: "Add their mobile number" };
    const visits = Math.min(12, Math.max(1, Math.round(input.visits ?? 6))), swaps = Math.min(2, Math.max(0, Math.round(input.swaps ?? 0)));
    const perVisit = r2(Number(input.perVisit) || 0), swapPrice = r2(Number(input.swapPrice) || 0);
    if (!perVisit) return { ok: false as const, error: "Add the price per oil change" };
    row = { name: input.name?.trim() || null, phone: e164(input.phone), car: input.car?.trim() || null, visits_per_year: visits, swaps_per_year: swaps,
      per_visit: perVisit, swap_price: swapPrice, monthly: r2((visits * perVisit + swaps * swapPrice) / 12) };
  }
  const [cust] = await sbGet<{ id: string }>(`customers?select=id&phone=eq.${enc(row.phone!)}`);
  const ins = await sbInsert<Plan>("plans", { ...row, customer_id: cust?.id ?? null, status: "offered", offered_at: new Date().toISOString(), created_by: owner });
  if (!ins.ok || !ins.data) return { ok: false as const, error: "Couldn't save the plan" };
  if (row.request_id) await sbPatch("plan_requests", `id=eq.${row.request_id}`, { status: "offered" });
  const sms = await textTerms(ins.data);
  return { ok: true as const, plan: ins.data, sms };
}

export async function textTerms(p: Plan) {
  const body = await template("plan_terms");
  if (!body) return { sent: false, status: "template_off" };
  const monthlyHst = r2(Number(p.monthly) * (1 + Number(p.hst_rate)));
  return sendSms(p.phone, fill(body, { first_name: first(p), car: p.car || "car", visits: String(p.visits_per_year),
    swaps: p.swaps_per_year ? ` and ${p.swaps_per_year} on-rim tire swap${p.swaps_per_year > 1 ? "s" : ""}` : "", monthly: money(p.monthly), monthly_hst: `${money(monthlyHst)} with HST` }),
    { kind: "plan_terms", customerId: p.customer_id });
}

/** A text came in. If it's I AGREE from someone with a plan offer, start the plan. */
export async function agreeByText(phone: string, text: string) {
  if (!/^\s*(i\s*agree|i\s*accept|agree|agreed|yes,?\s*i\s*agree)[.!\s]*$/i.test(text)) return null;
  const [p] = await sbGet<Plan>(`plans?select=*&phone=eq.${enc(e164(phone))}&status=eq.offered&order=offered_at.desc&limit=1`).catch(() => []);
  if (!p) return null;
  return activatePlan(p, "text");
}

export async function activatePlan(p: Plan, how: "text" | string) {
  const today = halifaxDate(new Date());
  const d = planDates(today);
  let customerId = p.customer_id;
  if (!customerId) {
    const [c] = await sbGet<{ id: string }>(`customers?select=id&phone=eq.${enc(p.phone)}`);
    if (c) customerId = c.id;
    else {
      const [fn, ...ln] = (p.name || "").trim().split(/\s+/);
      const ins = await sbInsert<{ id: string }>("customers", { first_name: fn || null, last_name: ln.join(" ") || null, phone: p.phone, source: "plan" });
      customerId = ins.data?.id ?? null;
    }
  }
  const [up] = await sbPatchRows<Plan>("plans", `id=eq.${p.id}&status=eq.offered`, { status: "active", agreed_at: new Date().toISOString(), starts_on: d.starts, ends_on: d.ends,
    bill_day: d.billDay, customer_id: customerId, notes: [p.notes, how === "text" ? "Agreed by text (I AGREE)" : `Started by ${how}`].filter(Boolean).join(" · ") });
  if (!up) return { ok: true as const, already: true };
  if (p.request_id) await sbPatch("plan_requests", `id=eq.${p.request_id}`, { status: "signed" });
  const bill = await createBill(up, monthStart(today));
  const body = await template("plan_welcome");
  if (body && bill) await sendSms(up.phone, fill(body, { first_name: first(up), total: money(bill.total), pay_link: `${siteUrl()}/pay/${bill.token}`, book_link: `${siteUrl()}/booking` }),
    { kind: "plan_welcome", customerId: customerId });
  if (bill) await sbPatch("plan_bills", `id=eq.${bill.id}`, { sent_at: new Date().toISOString() });
  await alertOwners(`${up.name || up.phone} started a maintenance plan`, `${up.car || ""} · ${money(up.monthly)}/month + HST. First payment link sent.`, `plan-${up.id}`);
  return { ok: true as const, plan: up };
}

export async function createBill(p: Plan, period: string): Promise<Bill | null> {
  const subtotal = r2(Number(p.monthly)), hst = r2(subtotal * Number(p.hst_rate));
  const r = await sbInsert<Bill>("plan_bills", { plan_id: p.id, period, subtotal, hst, total: r2(subtotal + hst), token: crypto.randomBytes(15).toString("base64url") });
  if (r.ok) return r.data ?? null;
  const [b] = await sbGet<Bill>(`plan_bills?select=*&plan_id=eq.${p.id}&period=eq.${period}`);   // already made for that month
  return b ?? null;
}

/** Daily: send this month's pay link on each plan's bill day, and end plans that have run their 12 months. */
export async function runPlanBilling(today = halifaxDate(new Date())) {
  const out = { billed: 0, ended: 0 };
  const plans = await sbGet<Plan>("plans?select=*&status=eq.active").catch(() => []);
  for (const p of plans) {
    if (p.ends_on && today >= p.ends_on) {
      await sbPatch("plans", `id=eq.${p.id}`, { status: "ended" });
      await alertOwners(`${p.name || p.phone}'s plan finished its 12 months`, "Offer them another year.", `plan-end-${p.id}`);
      out.ended++; continue;
    }
    if (!p.bill_day || Number(today.slice(8, 10)) < p.bill_day) continue;
    const period = monthStart(today);
    const [had] = await sbGet<{ id: string }>(`plan_bills?select=id&plan_id=eq.${p.id}&period=eq.${period}`);
    if (had) continue;
    const bill = await createBill(p, period);
    if (!bill) continue;
    const body = await template("plan_bill");
    if (body) {
      const r = await sendSms(p.phone, fill(body, { first_name: first(p), month: monthName(period), total: money(bill.total), pay_link: `${siteUrl()}/pay/${bill.token}` }), { kind: "plan_bill", customerId: p.customer_id });
      if (r.sent) await sbPatch("plan_bills", `id=eq.${bill.id}`, { sent_at: new Date().toISOString() });
    }
    out.billed++;
  }
  return out;
}

/** A plan payment came in: the bill is paid and a receipt (a job row) makes it count in Money and HST. */
export async function markBillPaid(billId: string, method: string, by: string) {
  const [b] = await sbGet<Bill & { plans: Plan | null }>(`plan_bills?select=*,plans(*)&id=eq.${enc(billId)}`);
  if (!b || !b.plans) return { ok: false as const, error: "Bill not found" };
  if (b.status === "paid") return { ok: true as const };
  const claimed = await sbPatchRows("plan_bills", `id=eq.${b.id}&status=eq.open`, { status: "paid", paid_at: new Date().toISOString(), method });
  if (!claimed.length) return { ok: true as const };
  const receiptNo = await sbRpc<number>("next_receipt_no");
  const token = crypto.randomBytes(18).toString("base64url");
  const job = await sbInsert<{ id: string }>("jobs", { customer_id: b.plans.customer_id, done_at: new Date().toISOString(), service: "plan_payment",
    revenue: Number(b.subtotal), cost_oil: 0, cost_parts: 0, cost_other: 0, lines: [{ label: `Maintenance plan, ${monthName(b.period)}`, amount: Number(b.subtotal) }],
    subtotal: b.subtotal, hst: b.hst, total: b.total, receipt_no: receiptNo, receipt_token: token, vehicle_text: b.plans.car, payment_method: method, done_by: "both", notes: `Plan payment recorded by ${by}` });
  if (job.ok && job.data) await sbPatch("plan_bills", `id=eq.${b.id}`, { job_id: job.data.id });
  await sbInsert("payments", { amount: b.total, method: method === "card_online" ? "card_online" : method, processor_ref: `Plan payment ${monthName(b.period)} (${b.plans.name || b.plans.phone})` }).catch(() => null);
  return { ok: true as const };
}

/** The active plan for this customer (and car), with what's left. null if none. */
export async function planFor(customerId: string, vehicleId: string | null, atIso: string) {
  const plans = await sbGet<Plan>(`plans?select=*&customer_id=eq.${enc(customerId)}&status=eq.active`).catch(() => []);
  const p = plans.find((x) => !x.vehicle_id || x.vehicle_id === vehicleId);
  if (!p) return null;
  if (!p.vehicle_id && vehicleId) await sbPatch("plans", `id=eq.${p.id}`, { vehicle_id: vehicleId });   // first visit ties the plan to that car
  const used = await sbGet<{ starts_at: string; services: { job?: string; addons?: string[] } | null }>(`bookings?select=starts_at,services&plan_id=eq.${p.id}&status=neq.cancelled`);
  const month = atIso.slice(0, 7);
  const oil = used.filter((u) => !u.services?.job || ["oil_change", "seasonal"].includes(u.services.job));
  const swaps = used.filter((u) => u.services?.job === "seasonal" || u.services?.job === "tires" || (u.services?.addons ?? []).includes("tires"));
  return { plan: p, oilLeft: oilLeft({ visits: p.visits_per_year, usedTotal: oil.length, usedThisMonth: oil.filter((u) => halifaxDate(new Date(u.starts_at)).slice(0, 7) === month).length }),
    swapLeft: swaps.length < p.swaps_per_year, used: oil.length, swapsUsed: swaps.length };
}

/** HQ list: requests to offer, offers waiting for I AGREE, and active plans with visits used and money owing. */
export async function plansOverview() {
  const [requests, plans, bills] = await Promise.all([
    sbGet<{ id: string; customer_name: string; phone: string; car: string; visits: number; swaps: number; monthly: number; status: string; created_at: string }>("plan_requests?select=id,customer_name,phone,car,visits,swaps,monthly,status,created_at&status=eq.new&order=created_at.desc").catch(() => []),
    sbGet<Plan>("plans?select=*&status=in.(offered,active)&order=created_at.desc").catch(() => []),
    sbGet<Bill>("plan_bills?select=*&status=eq.open&order=period").catch(() => []),
  ]);
  const used = plans.length ? await sbGet<{ plan_id: string; services: { job?: string } | null }>(`bookings?select=plan_id,services&plan_id=in.(${plans.map((p) => p.id).join(",")})&status=neq.cancelled`).catch(() => []) : [];
  return {
    requests,
    plans: plans.map((p) => ({ ...p, used: used.filter((u) => u.plan_id === p.id && (!u.services?.job || ["oil_change", "seasonal"].includes(u.services.job))).length,
      owing: bills.filter((b) => b.plan_id === p.id).map((b) => ({ id: b.id, period: b.period, total: Number(b.total), token: b.token, sent_at: b.sent_at })) })),
  };
}

export async function resendBill(billId: string) {
  const [b] = await sbGet<Bill & { plans: Plan | null }>(`plan_bills?select=*,plans(*)&id=eq.${enc(billId)}`);
  if (!b?.plans) return { sent: false, status: "not_found" };
  const body = await template("plan_bill");
  if (!body) return { sent: false, status: "template_off" };
  const r = await sendSms(b.plans.phone, fill(body, { first_name: first(b.plans), month: monthName(b.period), total: money(b.total), pay_link: `${siteUrl()}/pay/${b.token}` }), { kind: "plan_bill", customerId: b.plans.customer_id });
  if (r.sent) await sbPatch("plan_bills", `id=eq.${b.id}`, { sent_at: new Date().toISOString() });
  return r;
}

export async function endPlan(id: string, cancelled: boolean) {
  await sbPatch("plans", `id=eq.${enc(id)}&status=in.(offered,active)`, { status: cancelled ? "cancelled" : "ended" });
  await sbPatch("plan_bills", `plan_id=eq.${enc(id)}&status=eq.open`, { status: "void" });
  return { ok: true as const };
}
