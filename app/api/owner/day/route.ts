// Everything the calendar needs for one day: jobs, totals, what to bring, time off.
import { activeHolds, holdLink } from "@/lib/os/holds";
import { addonNeeds, sumNeeds, onShelf, normPart, chargedAddons, ADDON_COST_DEFAULT } from "@/lib/os/addon-needs";
import { dayRoute } from "@/lib/os/route";
import { bookingPhotoLink } from "@/lib/os/vin-photo";
import { lastVisit } from "@/lib/os/last-visit";
import { NextRequest, NextResponse } from "next/server";
import { currentStaff } from "@/lib/os/auth";
import { canOf } from "@/lib/os/roles";
import { sbGet } from "@/lib/os/db";
import { gasPerJob } from "@/lib/os/gas";
import { halifaxToDate, halifaxDate } from "@/lib/os/slots";

export const dynamic = "force-dynamic";

type Row = {
  id: string; starts_at: string; ends_at: string; status: string; pay_mode: string; address: string | null; paid_at: string | null;
  jobs: { receipt_no: number | null; total: number | null; subtotal?: number | null; revenue?: number | null; tip?: number | null; cost_oil?: number | null; cost_parts?: number | null; cost_other?: number | null; oil_grade?: string | null; oil_litres?: number | null; filter_part?: string | null }[] | null;
  quoted_total: number | null; quote_breakdown: { lines?: { label: string; amount: number }[]; profit?: number | null } | null; needs_review: string[] | null; notes: string | null; cars: number; vehicle_id?: string | null; group_id?: string | null;
  services: { job?: string; own?: "both" | "oil" | "filter" | null; addons?: string[] } | null; source: string | null;
  customers: { first_name: string | null; last_name: string | null; phone: string | null; address: string | null } | null;
  vehicles: { year: number | null; make: string | null; model: string | null; engine: string | null;
    vehicle_specs: { oil_grade: string; capacity_l: number; oil_filter_part: string | null; oil_spec: string | null; engine: string | null; fuel: string | null;
      wix_filter: string | null; verified: boolean | null; source: string | null; confidence: string | null;
      cabin_filter_part?: string | null; air_filter_part?: string | null; wiper_driver?: string | null; wiper_passenger?: string | null; filter_note?: string | null } | null } | null;
};

export async function GET(req: NextRequest) {
  const me = currentStaff();
  if (!me) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const money = canOf(me.role).money;   // staff don't see profit, costs or the day's takings
  const date = req.nextUrl.searchParams.get("date") || halifaxDate(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "bad date" }, { status: 400 });
  const from = halifaxToDate(date, 0).toISOString(), to = halifaxToDate(date, 24 * 60).toISOString();

  const q = (extra: string) => sbGet<Row>(`bookings?select=id,starts_at,ends_at,status,pay_mode,address,paid_at,jobs(receipt_no,total,subtotal,revenue,tip,cost_oil,cost_parts,cost_other,oil_grade,oil_litres,filter_part),quoted_total,quote_breakdown,needs_review,notes,cars,services,source,vehicle_id,group_id,` +
      `customers(first_name,last_name,phone,address),vehicles(year,make,model,engine,vehicle_specs(oil_grade,capacity_l,oil_filter_part,oil_spec,engine,fuel,wix_filter,verified,source,confidence${extra}))` +
      `&starts_at=gte.${from}&starts_at=lt.${to}&status=neq.cancelled&order=starts_at`);
  // everything that only needs the date goes out at once (each trip to the database is a wait, so never one after another)
  const [rows, off, holdRows, oilPrices, rulesRows, gas] = await Promise.all([
    q(",cabin_filter_part,air_filter_part,wiper_driver,wiper_passenger,filter_note").catch(() => q("")),   // part number columns come with migration 0026
    sbGet<{ id: string; starts_at: string; ends_at: string; reason: string | null }>(
      `time_off?select=id,starts_at,ends_at,reason&starts_at=lt.${to}&ends_at=gt.${from}&order=starts_at`),
    activeHolds(from, to),
    sbGet<{ grade: string; cost_per_l: number }>("oil_prices?select=grade,cost_per_l&active=is.true").catch(() => []),
    sbGet<{ key: string; value: number }>("pricing_rules?select=key,value&key=in.(consumables,filter_estimate,hst_rate,topup_washer_l,topup_coolant_l)").catch(() => []),
    money ? gasPerJob().catch(() => null) : Promise.resolve(null),
  ]);
  const oilPerL = Object.fromEntries(oilPrices.map((o) => [o.grade, Number(o.cost_per_l)]));
  const rr = Object.fromEntries(rulesRows.map((x) => [x.key, Number(x.value)]));
  const topupRules = { washer: rr.topup_washer_l, coolant: rr.topup_coolant_l };   // litres a top-up takes (undefined = 2 L washer, 1 L coolant)
  // Job card profit counts parts before tax: we're HST registered, so the HST we pay on oil and parts comes back
  // on the return (gas per job is already before tax). The minimum-profit price check still uses the with-tax cost, to be safe.
  const exTax = (n: number) => n / (1 + Number(rr.hst_rate ?? 0.14));

  // What to bring: litres per oil grade and filters per part number, checked against stock
  const oil: Record<string, number> = {};
  const filters: Record<string, number> = {};
  for (const r of rows) {
    const s = r.vehicles?.vehicle_specs;
    if (["done", "no_show", "cancelled"].includes(r.status)) continue;   // finished: its oil and filter are already used (and off the shelf)
    if (!s || r.services?.own === "both" || (r.services?.job && !["oil_change", "seasonal"].includes(r.services.job))) continue;
    const g = s.oil_grade.toUpperCase().replace(/^(\d+|O)W/, (m) => m.replace("O", "0")).replace(/^EURO /, "Euro ");   // "Ow-20" and "0W-20" are the same oil
    if (r.services?.own !== "oil") oil[g] = Math.round(((oil[g] || 0) + Number(s.capacity_l) * (r.cars || 1)) * 10) / 10;
    if (s.oil_filter_part && r.services?.own !== "filter") filters[s.oil_filter_part] = (filters[s.oil_filter_part] || 0) + (r.cars || 1);
  }
  // the add-ons they picked: cabin and air filters, wipers, battery, top-ups (any kind of job)
  const addonList = sumNeeds(rows.filter((r) => !["done", "no_show", "cancelled"].includes(r.status)).map((r) => addonNeeds(r.services?.addons, r.vehicles?.vehicle_specs, r.cars || 1, { washer_fluid: topupRules.washer, coolant: topupRules.coolant })));
  // then everything that needs the day's jobs, also all at once
  // filters linked as the same part (Parts Source vs NAPA): count both, and say both on the Bring list
  const { loadLinks, sameParts, onHandAll, eitherOf } = await import("@/lib/os/part-alias");
  const links = await loadLinks();
  const fl = Array.from(new Set(Object.keys(filters).flatMap((pn) => sameParts(pn, links))));
  const photoLinks: Record<string, string[]> = {};
  const filterCosts: Record<string, number> = {};
  // what we flagged on each car last visit ("tires coming up soon"), to offer it on this visit
  const vids = Array.from(new Set(rows.map((r) => r.vehicle_id).filter(Boolean))) as string[];
  const prevJobs: { vehicle_id: string; booking_id: string | null; done_at: string; inspection: Record<string, { status?: string }> | null; customer_note?: string | null }[] = [];
  const [parts, , , route, , shelf] = await Promise.all([
    fl.length ? sbGet<{ part_number: string; on_hand: number }>(`parts?select=part_number,on_hand&part_number=in.(${fl.join(",")})`) : Promise.resolve([]),
    fl.length ? sbGet<{ our_cost: number; parts: { part_number: string } | null }>(`part_quotes?select=our_cost,parts!inner(part_number)&parts.part_number=in.(${fl.join(",")})&order=checked_at.desc`)
      .then((q) => { for (const x of q) if (x.parts && filterCosts[x.parts.part_number] == null) filterCosts[x.parts.part_number] = Number(x.our_cost); }).catch(() => null) : null,
    // VIN / engine-label photos customers sent (signed links, good for an hour). Skipped if that column isn't there yet.
    rows.length ? sbGet<{ id: string; photo_paths: string[] | null }>(`bookings?select=id,photo_paths&id=in.(${rows.map((r) => r.id).join(",")})&photo_paths=not.is.null`)
      .then((w) => Promise.all(w.map(async (b) => { photoLinks[b.id] = (await Promise.all((b.photo_paths ?? []).map((p) => bookingPhotoLink(p)))).filter(Boolean) as string[]; })))
      .catch(() => null) : null,   // migration 0019 not run yet
    dayRoute(date, rows).catch(() => null),
    vids.length ? sbGet<(typeof prevJobs)[number]>(`jobs?select=*&vehicle_id=in.(${vids.join(",")})&order=done_at.desc&limit=300`).then((x) => { prevJobs.push(...x); }).catch(() => null) : null,
    addonList.length ? sbGet<{ part_number: string; description: string | null; category: string | null; on_hand: number }>("parts?select=part_number,description,category,on_hand&or=(category.is.null,category.neq.oil)").catch(() => []) : Promise.resolve([]),
  ]);
  const lastTimeFor = (r: Row) => { const p = prevJobs.find((j) => j.vehicle_id === r.vehicle_id && j.booking_id !== r.id && j.done_at < r.starts_at); return p ? lastVisit(p.inspection, p.customer_note) : null; };

  // oil filter price: a linked filter (Parts Source vs NAPA) counts, at the one we'd grab from the shelf
  const { pickCost } = await import("@/lib/os/part-alias");
  const filterCostOf = (pn: string) => pickCost(pn, links, (x) => filterCosts[x], (x) => onHandAll(x, [], parts));
  // linked filters: which one each job gets (earlier bookings take theirs first, the NAPA number first)
  const { allocated } = await import("@/lib/os/part-alias");
  const alloc: Record<string, { part: string; inStock: boolean }> = {};
  await Promise.all(rows.map(async (r) => {
    const pn = r.vehicles?.vehicle_specs?.oil_filter_part;
    if (!pn || sameParts(pn, links).length < 2 || ["done", "cancelled", "no_show"].includes(r.status)) return;
    const a = await allocated(pn, r.starts_at, { excludeId: r.id, cars: r.cars || 1 }).catch(() => null);
    if (a) alloc[r.id] = a;
  }));
  const filterCostFor = (r: Row, pn: string) => { const a = alloc[r.id]; return (a?.inStock ? filterCosts[a.part] : undefined) ?? filterCostOf(pn); };
  // what we last paid for the cabin and air filters on these cars (receipts), matched loosely ("FIL 26195" = "26195")
  const addonPns = Array.from(new Set(rows.flatMap((r) => [r.vehicles?.vehicle_specs?.cabin_filter_part, r.vehicles?.vehicle_specs?.air_filter_part]).filter(Boolean) as string[]));
  const addonCosts: Record<string, number> = {};
  if (money && addonPns.length) {
    const quotes = await sbGet<{ our_cost: number | null; parts: { part_number: string } | null }>(`part_quotes?select=our_cost,parts!inner(part_number)&our_cost=not.is.null&order=checked_at.desc&limit=2000`).catch(() => []);
    for (const pn of addonPns) { const q = quotes.find((x) => x.parts && normPart(x.parts.part_number) === normPart(pn)); if (q) addonCosts[pn] = Number(q.our_cost); }
  }
  /** The add-on parts on a booking that's not done yet: our cost for that part number if we've bought it, otherwise the usual cost. */
  const addonCostsOf = (r: Row, s: { cabin_filter_part?: string | null; air_filter_part?: string | null } | null | undefined) => {
    const items = chargedAddons(r.quote_breakdown?.lines ?? [], r.services?.addons, r.cars || 1).map(({ kind, times }) => {
      const pn = kind === "cabin_filter" ? s?.cabin_filter_part : kind === "engine_filter" ? s?.air_filter_part : null;
      const known = pn ? addonCosts[pn] : undefined;
      return { kind, cost: Math.round(exTax((known ?? rr[`addon_part_${kind}`] ?? ADDON_COST_DEFAULT[kind]) * times) * 100) / 100, guess: known == null };
    });
    return items;
  };

  // No profit on the booking yet (priced before the oil was looked up, a Square job, a price typed in): estimate it
  // from the price and what the oil and filter on file cost us.
  // What the oil, filter and supplies cost us on this booking, at today's prices (so a new receipt updates it right away)
  const costsOf = (r: Row, s: NonNullable<NonNullable<Row["vehicles"]>["vehicle_specs"]> | null | undefined) => {
    const job = r.services?.job ?? "oil_change";
    if (!["oil_change", "seasonal"].includes(job)) return null;
    // they bring the oil, the filter or both: we don't pay for what they bring, just the rest
    const own = r.services?.own ?? null;
    const weOil = own !== "both" && own !== "oil", weFilter = own !== "both" && own !== "filter";
    const lines = r.quote_breakdown?.lines ?? [];
    const subtotal = lines.reduce((t, l) => t + Number(l.amount), 0) || (r.quoted_total != null ? Number(r.quoted_total) / 1.14 : 0);
    if (!subtotal) return null;
    if ((weOil || weFilter) && !s) return null;
    const paidPerL = weOil && s ? oilPerL[s.oil_grade] : 0;
    if (paidPerL == null) return null;
    const perL = exTax(paidPerL);
    const cars = r.cars || 1;
    const known = weFilter && s?.oil_filter_part ? filterCostFor(r, s.oil_filter_part) ?? undefined : undefined;
    const filter = weFilter ? exTax(known ?? rr.filter_estimate ?? 6.5) : 0;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const litres = weOil && s ? Number(s.capacity_l) * cars : 0;
    return { subtotal: r2(subtotal), litres: r2(litres), perL: r2(perL), oil: r2(litres * perL), filter: r2(filter * cars),
      filterGuess: weFilter && known == null, supplies: r2(exTax(rr.consumables ?? 1) * cars), grade: s?.oil_grade ?? "", own };
  };
  const estimate = (c: ReturnType<typeof costsOf>) => (c ? Math.round((c.subtotal - c.oil - c.filter - c.supplies) * 100) / 100 : null);
  // ...and the gas to get there (each job's share of the last 60 days of gas receipts)
  // family price jobs are where we live: no gas for them
  const isFam = (r: Row) => !!(r.quote_breakdown as { family?: unknown } | null)?.family;
  const afterGas = (p: number | null, r: Row) => (p == null || !gas || isFam(r) ? p : Math.round((p - gas.perJob * (r.cars || 1)) * 100) / 100);
  const jobs = rows.map((r) => {
    const s = r.vehicles?.vehicle_specs;
    const name = [r.customers?.first_name, r.customers?.last_name].filter(Boolean).join(" ") || "Customer";
    const car = r.vehicles ? [r.vehicles.year, r.vehicles.make, r.vehicles.model].filter(Boolean).join(" ") : "";
    return {
      id: r.id, start: r.starts_at, end: r.ends_at, status: r.status, payMode: r.pay_mode, cars: r.cars,
      // what the profit is a share of: the price before HST (with the tip once it's done)
      sales: money ? (r.jobs?.[0] ? Number(r.jobs[0].revenue ?? r.jobs[0].subtotal ?? 0) : Math.round((r.quote_breakdown?.lines ?? []).reduce((t, l) => t + Number(l.amount || 0), 0) * 100) / 100) || null : null,
      family: !!(r.quote_breakdown as { family?: unknown } | null)?.family,
      paid: !!r.paid_at, receiptNo: r.jobs?.[0]?.receipt_no ?? null, finalTotal: r.jobs?.[0]?.total != null ? Number(r.jobs[0].total) : null,
      name, phone: r.customers?.phone ?? null, address: r.address || r.customers?.address || null, car,
      engine: r.vehicles?.engine ?? null,
      job: r.services?.job ?? "oil_change", addons: r.services?.addons ?? [],
      oil: s && (!r.services?.job || ["oil_change", "seasonal"].includes(r.services.job)) ? { grade: s.oil_grade, litres: Number(s.capacity_l), filter: s.oil_filter_part, spec: s.oil_spec,
        engine: s.engine, diesel: s.fuel === "diesel", wix: s.wix_filter, checked: !!s.verified, lowConfidence: s.source === "ai_lookup" && s.confidence === "low",
        filterInStock: s.oil_filter_part ? (alloc[r.id] ? alloc[r.id].inStock : onHandAll(s.oil_filter_part, links, parts) >= 1) : null,
        filterAlt: s.oil_filter_part ? sameParts(s.oil_filter_part, links).slice(1) : [], filterUse: alloc[r.id]?.inStock && alloc[r.id].part !== s.oil_filter_part ? alloc[r.id].part : null,
        filterCost: money && s.oil_filter_part ? filterCostFor(r, s.oil_filter_part) : null,
        filterNote: s.filter_note ?? null }
        // finished: what the job actually got (even if the car has no oil on file)
        : r.jobs?.[0]?.oil_grade ? { grade: r.jobs[0].oil_grade, litres: Number(r.jobs[0].oil_litres ?? 0) / (r.cars || 1), filter: r.jobs[0].filter_part ?? null, spec: null, engine: null, diesel: false, wix: null,
            checked: true, lowConfidence: false, filterInStock: null, filterCost: null, filterNote: null } : null,
      // part numbers we have used on this car before
      partNos: s ? [s.cabin_filter_part ? `Cabin filter ${s.cabin_filter_part}` : null, s.air_filter_part ? `Engine air filter ${s.air_filter_part}` : null,
        s.wiper_driver || s.wiper_passenger ? `Wipers ${[s.wiper_driver && `driver ${s.wiper_driver}`, s.wiper_passenger && `passenger ${s.wiper_passenger}`].filter(Boolean).join(", ")}` : null].filter(Boolean) as string[] : [],
      lines: r.quote_breakdown?.lines ?? [], total: r.quoted_total != null ? Number(r.quoted_total) : null,
      // plain oil changes: worked out live from today's oil and filter prices; with add-ons, the profit the quote worked out
      ...(() => {
        // finished: what it actually made (the oil, filter and parts recorded on the job), not an estimate
        const done = r.jobs?.[0];
        if (done && done.subtotal != null) {
          const spent = Number(done.cost_oil ?? 0) + Number(done.cost_parts ?? 0) + Number(done.cost_other ?? 0);
          // the oil and parts recorded on the job are what we paid with tax: before tax here (the HST comes back)
          const made = Math.round((Number(done.revenue ?? done.subtotal) - exTax(spent)) * 100) / 100;
          return { profit: money ? afterGas(made, r) : null, costs: null, actual: true };
        }
        // not done yet: worked out live from what we last paid for the oil, filter and any add-on parts
        const c = costsOf(r, s); const ad = addonCostsOf(r, s);
        const base = estimate(c);
        const live = base != null ? Math.round((base - ad.reduce((t, a) => t + a.cost, 0)) * 100) / 100 : null;
        return { profit: money ? afterGas(live ?? r.quote_breakdown?.profit ?? null, r) : null, costs: money && live != null && c ? { ...c, addons: ad } : null, actual: false }; })(), notes: r.notes, checks: (r.needs_review ?? []).filter((n) => !(isFam(r) && n.startsWith("Family price not set"))), imported: r.source === "square_import", photos: photoLinks[r.id] ?? [],
      lastTime: lastTimeFor(r),
      groupId: r.pay_mode !== "fleet_invoice" ? r.group_id ?? null : null,   // several cars on one visit: one card in HQ
      vin: (r.services as { vin?: string } | null)?.vin ?? null, vinCar: (r.services as { vinCar?: string } | null)?.vinCar ?? null,
    };
  });

  const holds = holdRows.map((h) => ({ id: h.id, start: h.starts_at, end: h.ends_at, expires: h.expires_at, name: h.first_name, phone: h.phone,
    job: h.job, cars: h.cars, note: h.note, by: h.created_by, link: holdLink(h.token) }));
  return NextResponse.json({
    date, jobs, timeOff: off, holds, route, gasPerJob: money ? gas?.perJob ?? null : null,
    totals: {
      jobs: jobs.length,
      booked: money ? Math.round(jobs.reduce((s, j) => s + (j.total || 0), 0) * 100) / 100 : null,
      profit: money ? Math.round(jobs.reduce((s, j) => s + (j.profit || 0), 0) * 100) / 100 : null,
    },
    bring: {
      oil: Object.entries(oil).map(([grade, litres]) => ({ grade, litres })),
      filters: Object.entries(filters).map(([part, qty]) => ({ part: eitherOf(part, links), qty, inStock: onHandAll(part, links, parts) })),
      addons: addonList.map((x) => ({ unit: x.unit ?? null, label: x.part ? x.label.replace(x.part, eitherOf(x.part, links)) : x.label, qty: x.qty, inStock: onShelf(x, (shelf ?? []) as never, (pn) => sameParts(pn, links)) })),
    },
  });
}
