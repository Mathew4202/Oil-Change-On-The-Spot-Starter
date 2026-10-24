// Everything the calendar needs for one day: jobs, totals, what to bring, time off.
import { NextRequest, NextResponse } from "next/server";
import { currentOwner } from "@/lib/os/auth";
import { sbGet } from "@/lib/os/db";
import { halifaxToDate, halifaxDate } from "@/lib/os/slots";

export const dynamic = "force-dynamic";

type Row = {
  id: string; starts_at: string; ends_at: string; status: string; pay_mode: string; address: string | null;
  quoted_total: number | null; quote_breakdown: { lines?: { label: string; amount: number }[]; profit?: number | null } | null; needs_review: string[] | null; notes: string | null; cars: number;
  services: { job?: string; own?: "both" | "oil" | "filter" | null; addons?: string[] } | null; source: string | null;
  customers: { first_name: string | null; last_name: string | null; phone: string | null; address: string | null } | null;
  vehicles: { year: number | null; make: string | null; model: string | null; engine: string | null;
    vehicle_specs: { oil_grade: string; capacity_l: number; oil_filter_part: string | null; oil_spec: string | null } | null } | null;
};

export async function GET(req: NextRequest) {
  if (!currentOwner()) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const date = req.nextUrl.searchParams.get("date") || halifaxDate(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "bad date" }, { status: 400 });
  const from = halifaxToDate(date, 0).toISOString(), to = halifaxToDate(date, 24 * 60).toISOString();

  const [rows, off] = await Promise.all([
    sbGet<Row>(`bookings?select=id,starts_at,ends_at,status,pay_mode,address,quoted_total,quote_breakdown,needs_review,notes,cars,services,source,` +
      `customers(first_name,last_name,phone,address),vehicles(year,make,model,engine,vehicle_specs(oil_grade,capacity_l,oil_filter_part,oil_spec))` +
      `&starts_at=gte.${from}&starts_at=lt.${to}&status=neq.cancelled&order=starts_at`),
    sbGet<{ id: string; starts_at: string; ends_at: string; reason: string | null }>(
      `time_off?select=id,starts_at,ends_at,reason&starts_at=lt.${to}&ends_at=gt.${from}&order=starts_at`),
  ]);

  // What to bring: litres per oil grade and filters per part number, checked against stock
  const oil: Record<string, number> = {};
  const filters: Record<string, number> = {};
  for (const r of rows) {
    const s = r.vehicles?.vehicle_specs;
    if (!s || r.services?.own === "both" || (r.services?.job && r.services.job !== "oil_change")) continue;
    if (r.services?.own !== "oil") oil[s.oil_grade] = Math.round(((oil[s.oil_grade] || 0) + Number(s.capacity_l) * (r.cars || 1)) * 10) / 10;
    if (s.oil_filter_part && r.services?.own !== "filter") filters[s.oil_filter_part] = (filters[s.oil_filter_part] || 0) + (r.cars || 1);
  }
  const parts = Object.keys(filters).length
    ? await sbGet<{ part_number: string; on_hand: number }>(`parts?select=part_number,on_hand&part_number=in.(${Object.keys(filters).join(",")})`)
    : [];
  const stock = Object.fromEntries(parts.map((p) => [p.part_number, Number(p.on_hand)]));

  const jobs = rows.map((r) => {
    const s = r.vehicles?.vehicle_specs;
    const name = [r.customers?.first_name, r.customers?.last_name].filter(Boolean).join(" ") || "Customer";
    const car = r.vehicles ? [r.vehicles.year, r.vehicles.make, r.vehicles.model].filter(Boolean).join(" ") : "";
    return {
      id: r.id, start: r.starts_at, end: r.ends_at, status: r.status, payMode: r.pay_mode, cars: r.cars,
      name, phone: r.customers?.phone ?? null, address: r.address || r.customers?.address || null, car,
      engine: r.vehicles?.engine ?? null,
      job: r.services?.job ?? "oil_change", addons: r.services?.addons ?? [],
      oil: s && (!r.services?.job || r.services.job === "oil_change") ? { grade: s.oil_grade, litres: Number(s.capacity_l), filter: s.oil_filter_part, spec: s.oil_spec } : null,
      lines: r.quote_breakdown?.lines ?? [], total: r.quoted_total != null ? Number(r.quoted_total) : null,
      profit: r.quote_breakdown?.profit ?? null, notes: r.notes, checks: r.needs_review ?? [], imported: r.source === "square_import",
    };
  });

  return NextResponse.json({
    date, jobs, timeOff: off,
    totals: {
      jobs: jobs.length,
      booked: Math.round(jobs.reduce((s, j) => s + (j.total || 0), 0) * 100) / 100,
      profit: Math.round(jobs.reduce((s, j) => s + (j.profit || 0), 0) * 100) / 100,
    },
    bring: {
      oil: Object.entries(oil).map(([grade, litres]) => ({ grade, litres })),
      filters: Object.entries(filters).map(([part, qty]) => ({ part, qty, inStock: stock[part] ?? 0 })),
    },
  });
}
