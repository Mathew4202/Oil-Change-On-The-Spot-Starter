// Maintenance plan: GET ?year&make&model&engine&visits&swaps → monthly price for this car · POST → "I want this plan" (owners follow up by text)
import { NextRequest, NextResponse } from "next/server";
import { buildQuote } from "@/lib/os/quote-service";
import { TIRE_CHANGE, type VehicleClass } from "@/lib/os/pricing-engine";
import { planPrice } from "@/lib/os/plan";
import { sbInsert } from "@/lib/os/db";
import { e164 } from "@/lib/os/booking";
import { pushToOwners } from "@/lib/os/push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function price(sp: URLSearchParams) {
  const year = Number(sp.get("year")), make = sp.get("make") || "", model = sp.get("model") || "";
  if (!year || !make || !model) return null;
  const { quote, vehicleClass, rules, engines, spec } = await buildQuote({ year, make, model, engine: sp.get("engine") || null, job: "oil_change", addons: [], own: null, km: null, cars: 1 });
  const regular = Number(quote.lines[0]?.amount ?? quote.subtotal);
  const plan = planPrice({ regular, profit: quote.profit, visits: Number(sp.get("visits") || 6), swaps: Number(sp.get("swaps") || 0),
    swapPrice: TIRE_CHANGE[(vehicleClass || "Sedan") as VehicleClass], hstRate: Number((rules as Record<string, number>)?.hst_rate ?? 0.14) });
  const engine = sp.get("engine") || "";
  return { car: `${year} ${make} ${model}${engine ? ` ${engine}` : ""}`, regular, oil: quote.lines[0]?.label ?? "", vehicleClass, plan,
    engines, pricedEngine: engine ? spec?.engine ?? engine : null };
}

export async function GET(req: NextRequest) {
  const r = await price(req.nextUrl.searchParams).catch(() => null);
  return r ? NextResponse.json(r) : NextResponse.json({ error: "Pick your car first" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const name = String(b.name || "").trim().slice(0, 80), phone = String(b.phone || "");
  if (!name || phone.replace(/\D/g, "").length < 10) return NextResponse.json({ error: "Add your name and a 10-digit mobile number." }, { status: 400 });
  const sp = new URLSearchParams({ year: String(b.year || ""), make: String(b.make || ""), model: String(b.model || ""), engine: String(b.engine || ""), visits: String(b.visits || 6), swaps: String(b.swaps || 0) });
  const r = await price(sp).catch(() => null);
  if (!r) return NextResponse.json({ error: "Pick your car first." }, { status: 400 });
  const row = await sbInsert("plan_requests", { customer_name: name, phone: e164(phone), email: String(b.email || "").trim().slice(0, 120) || null, car: r.car,
    visits: r.plan.visits, swaps: r.plan.swaps, monthly: r.plan.monthly, breakdown: r });
  if (!row.ok) return NextResponse.json({ error: "Couldn't send it. Please try again." }, { status: 500 });
  const title = `Maintenance plan request: ${name}`, body = `${r.car}, ${r.plan.visits} oil changes${r.plan.swaps ? ` + ${r.plan.swaps} swaps` : ""} a year, $${r.plan.monthly.toFixed(2)}/month + HST. Text them the plan terms.`;
  try { await sbInsert("notifications", { kind: "plan_request", title, body }); } catch { /* best effort */ }
  await Promise.race([pushToOwners({ title, body, url: "/owner", tag: `plan-${row.data ? (row.data as { id: string }).id : name}` }).catch(() => null), new Promise((res) => setTimeout(res, 4000))]);
  return NextResponse.json({ ok: true });
}
