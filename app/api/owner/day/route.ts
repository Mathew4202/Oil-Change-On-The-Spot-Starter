// Everything the calendar needs for one day: jobs, totals, what to bring, time off.
import { activeHolds, holdLink } from "@/lib/os/holds";
import { bookingPhotoLink } from "@/lib/os/vin-photo";
import { NextRequest, NextResponse } from "next/server";
import { currentOwner } from "@/lib/os/auth";
import { sbGet } from "@/lib/os/db";
import { halifaxToDate, halifaxDate } from "@/lib/os/slots";

export const dynamic = "force-dynamic";

type Row = {
  id: string; starts_at: string; ends_at: string; status: string; pay_mode: string; address: string | null; paid_at: string | null;
  jobs: { receipt_no: number | null; total: number | null }[] | null;
  quoted_total: number | null; quote_breakdown: { lines?: { label: string; amount: number }[]; profit?: number | null } | null; needs_review: string[] | null; notes: string | null; cars: number;
  services: { job?: string; own?: "both" | "oil" | "filter" | null; addons?: string[] } | null; source: string | null;
  customers: { first_name: string | null; last_name: string | null; phone: string | null; address: string | null } | null;
  vehicles: { year: number | null; make: string | null; model: string | null; engine: string | null;
    vehicle_specs: { oil_grade: string; capacity_l: number; oil_filter_part: string | null; oil_spec: string | null; engine: string | null; fuel: string | null;
      wix_filter: string | null; verified: boolean | null; source: string | null; confidence: string | null;
      cabin_filter_part?: string | null; air_filter_part?: string | null; wiper_driver?: string | null; wiper_passenger?: string | null; filter_note?: string | null } | null } | null;
};

export async function GET(req: NextRequest) {
  if (!currentOwner()) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const date = req.nextUrl.searchParams.get("date") || halifaxDate(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "bad date" }, { status: 400 });
  const from = halifaxToDate(date, 0).toISOString(), to = halifaxToDate(date, 24 * 60).toISOString();

  const q = (extra: string) => sbGet<Row>(`bookings?select=id,starts_at,ends_at,status,pay_mode,address,paid_at,jobs(receipt_no,total),quoted_total,quote_breakdown,needs_review,notes,cars,services,source,` +
      `customers(first_name,last_name,phone,address),vehicles(year,make,model,engine,vehicle_specs(oil_grade,capacity_l,oil_filter_part,oil_spec,engine,fuel,wix_filter,verified,source,confidence${extra}))` +
      `&starts_at=gte.${from}&starts_at=lt.${to}&status=neq.cancelled&order=starts_at`);
  const [rows, off] = await Promise.all([
    q(",cabin_filter_part,air_filter_part,wiper_driver,wiper_passenger,filter_note").catch(() => q("")),   // part number columns come with migration 0026
    sbGet<{ id: string; starts_at: string; ends_at: string; reason: string | null }>(
      `time_off?select=id,starts_at,ends_at,reason&starts_at=lt.${to}&ends_at=gt.${from}&order=starts_at`),
  ]);

  // What to bring: litres per oil grade and filters per part number, checked against stock
  const oil: Record<string, number> = {};
  const filters: Record<string, number> = {};
  for (const r of rows) {
    const s = r.vehicles?.vehicle_specs;
    if (!s || r.services?.own === "both" || (r.services?.job && !["oil_change", "seasonal"].includes(r.services.job))) continue;
    if (r.services?.own !== "oil") oil[s.oil_grade] = Math.round(((oil[s.oil_grade] || 0) + Number(s.capacity_l) * (r.cars || 1)) * 10) / 10;
    if (s.oil_filter_part && r.services?.own !== "filter") filters[s.oil_filter_part] = (filters[s.oil_filter_part] || 0) + (r.cars || 1);
  }
  const parts = Object.keys(filters).length
    ? await sbGet<{ part_number: string; on_hand: number }>(`parts?select=part_number,on_hand&part_number=in.(${Object.keys(filters).join(",")})`)
    : [];
  const stock = Object.fromEntries(parts.map((p) => [p.part_number, Number(p.on_hand)]));
  const filterCosts: Record<string, number> = {};
  if (Object.keys(filters).length) {
    const q = await sbGet<{ our_cost: number; parts: { part_number: string } | null }>(`part_quotes?select=our_cost,parts!inner(part_number)&parts.part_number=in.(${Object.keys(filters).join(",")})&order=checked_at.desc`).catch(() => []);
    for (const x of q) if (x.parts && filterCosts[x.parts.part_number] == null) filterCosts[x.parts.part_number] = Number(x.our_cost);
  }

  // VIN / engine-label photos customers sent (signed links, good for an hour). Skipped if that column isn't there yet.
  const photoLinks: Record<string, string[]> = {};
  if (rows.length) {
    try {
      const withPhotos = await sbGet<{ id: string; photo_paths: string[] | null }>(`bookings?select=id,photo_paths&id=in.(${rows.map((r) => r.id).join(",")})&photo_paths=not.is.null`);
      for (const b of withPhotos) photoLinks[b.id] = (await Promise.all((b.photo_paths ?? []).map((p) => bookingPhotoLink(p)))).filter(Boolean) as string[];
    } catch { /* migration 0019 not run yet */ }
  }

  const jobs = rows.map((r) => {
    const s = r.vehicles?.vehicle_specs;
    const name = [r.customers?.first_name, r.customers?.last_name].filter(Boolean).join(" ") || "Customer";
    const car = r.vehicles ? [r.vehicles.year, r.vehicles.make, r.vehicles.model].filter(Boolean).join(" ") : "";
    return {
      id: r.id, start: r.starts_at, end: r.ends_at, status: r.status, payMode: r.pay_mode, cars: r.cars,
      paid: !!r.paid_at, receiptNo: r.jobs?.[0]?.receipt_no ?? null, finalTotal: r.jobs?.[0]?.total != null ? Number(r.jobs[0].total) : null,
      name, phone: r.customers?.phone ?? null, address: r.address || r.customers?.address || null, car,
      engine: r.vehicles?.engine ?? null,
      job: r.services?.job ?? "oil_change", addons: r.services?.addons ?? [],
      oil: s && (!r.services?.job || ["oil_change", "seasonal"].includes(r.services.job)) ? { grade: s.oil_grade, litres: Number(s.capacity_l), filter: s.oil_filter_part, spec: s.oil_spec,
        engine: s.engine, diesel: s.fuel === "diesel", wix: s.wix_filter, checked: !!s.verified, lowConfidence: s.source === "ai_lookup" && s.confidence === "low",
        filterInStock: s.oil_filter_part ? (stock[s.oil_filter_part] ?? 0) >= 1 : null, filterCost: s.oil_filter_part ? filterCosts[s.oil_filter_part] ?? null : null,
        filterNote: s.filter_note ?? null } : null,
      // part numbers we have used on this car before
      partNos: s ? [s.cabin_filter_part ? `Cabin filter ${s.cabin_filter_part}` : null, s.air_filter_part ? `Engine air filter ${s.air_filter_part}` : null,
        s.wiper_driver || s.wiper_passenger ? `Wipers ${[s.wiper_driver && `driver ${s.wiper_driver}`, s.wiper_passenger && `passenger ${s.wiper_passenger}`].filter(Boolean).join(", ")}` : null].filter(Boolean) as string[] : [],
      lines: r.quote_breakdown?.lines ?? [], total: r.quoted_total != null ? Number(r.quoted_total) : null,
      profit: r.quote_breakdown?.profit ?? null, notes: r.notes, checks: r.needs_review ?? [], imported: r.source === "square_import", photos: photoLinks[r.id] ?? [],
      vin: (r.services as { vin?: string } | null)?.vin ?? null, vinCar: (r.services as { vinCar?: string } | null)?.vinCar ?? null,
    };
  });

  const holds = (await activeHolds(from, to)).map((h) => ({ id: h.id, start: h.starts_at, end: h.ends_at, expires: h.expires_at, name: h.first_name, phone: h.phone,
    job: h.job, cars: h.cars, note: h.note, by: h.created_by, link: holdLink(h.token) }));
  return NextResponse.json({
    date, jobs, timeOff: off, holds,
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
