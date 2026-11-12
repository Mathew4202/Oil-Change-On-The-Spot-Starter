// What we wrote down on the job becomes the car's spec for next time (ours always beats an online lookup),
// and a booking made before the oil was known gets it attached once it's found.
import { sbGet, sbInsert, sbPatch, enc } from "@/lib/os/db";
import { sameCar } from "@/lib/os/car-match";
import { engineMatches, findSpecs, type Spec } from "@/lib/os/quote-service";
import { halifaxDate } from "@/lib/os/slots";

type OurRow = { id: string; year_from: number; make: string; model: string; engine: string | null; oil_grade: string | null; capacity_l: number | null;
  oil_filter_part: string | null; source: string | null; times_done: number | null };

/** Called when a job is finished with the oil, litres and filter we used. */
export async function learnFromJob(v: { id: string; year: number | null; make: string | null; model: string | null; engine: string | null },
  used: { grade: string | null; litres: number | null; filter: string | null; cars: number }) {
  if (!v.year || !v.make || !v.model || !used.grade || !used.litres) return null;
  const perCar = Math.round((used.litres / Math.max(1, used.cars)) * 10) / 10;
  if (!(perCar > 0 && perCar < 30)) return null;
  const grade = used.grade.trim().toUpperCase().replace(/^EURO /, "Euro ").replace(/^DIESEL /, "Diesel ");
  const filter = used.filter?.trim() || null;
  const rows = sameCar(await sbGet<OurRow>(`vehicle_specs?select=id,year_from,make,model,engine,oil_grade,capacity_l,oil_filter_part,source,times_done&source=in.(sheet,job_history)&year_from=lte.${v.year}&year_to=gte.${v.year}&oil_grade=not.is.null`).catch(() => []), v.make, v.model);
  const mine = v.engine ? rows.find((r) => engineMatches(v.engine!, r.engine)) : rows.find((r) => !r.engine) ?? (rows.length === 1 ? rows[0] : undefined);
  const today = halifaxDate(new Date());
  let id: string | null = null;
  if (mine && mine.oil_grade?.toUpperCase() === grade.toUpperCase()) {
    id = mine.id;
    await sbPatch("vehicle_specs", `id=eq.${mine.id}`, { times_done: (mine.times_done ?? 0) + 1, last_done: today,
      ...(filter && !mine.oil_filter_part ? { oil_filter_part: filter } : {}), ...(!mine.capacity_l ? { capacity_l: perCar } : {}) }).catch(() => null);
  } else if (mine && mine.source === "job_history") {
    // we did it differently this time (new oil): the latest job wins
    id = mine.id;
    await sbPatch("vehicle_specs", `id=eq.${mine.id}`, { oil_grade: grade, capacity_l: perCar, ...(filter ? { oil_filter_part: filter } : {}),
      times_done: (mine.times_done ?? 0) + 1, last_done: today }).catch(() => null);
  } else {
    // first time we've done this car (or this engine), or our sheet says another oil: what we just used is saved as this car's, so it's on file next time. Keep the oil approval / diesel flag from the online lookup.
    const [linked] = await sbGet<{ spec: { oil_spec: string | null; fuel: string | null; oil_grade: string | null } | null }>(`vehicles?select=spec:vehicle_specs(oil_spec,fuel,oil_grade)&id=eq.${enc(v.id)}`).catch(() => []);
    const ls = linked?.spec;
    const r = await sbInsert<{ id: string }>("vehicle_specs", {
      year_from: v.year, year_to: v.year, make: v.make, model: v.model, engine: v.engine || null, oil_grade: grade, capacity_l: perCar, oil_filter_part: filter,
      source: "job_history", verified: true, times_done: 1, last_done: today,
      ...(ls && ls.oil_grade?.toUpperCase() === grade.toUpperCase() ? { oil_spec: ls.oil_spec, fuel: ls.fuel } : {}),
    });
    id = r.ok ? r.data?.id ?? null : null;
  }
  if (id) await sbPatch("vehicles", `id=eq.${enc(v.id)}`, { spec_id: id }).catch(() => null);
  return id;
}

const NOT_FOUND = /^Oil spec not found online/;

/** "Look up the oil now" on a job card (and the daily run for the next few days): find it, attach it, clear the note. */
export async function attachSpec(bookingId: string, opts: { retry?: boolean } = {}) {
  const [b] = await sbGet<{ id: string; needs_review: string[] | null; vehicle_id: string | null; services: { job?: string } | null;
    vehicles: { id: string; year: number | null; make: string | null; model: string | null; engine: string | null; spec_id: string | null } | null }>(
    `bookings?select=id,needs_review,vehicle_id,services,vehicles(id,year,make,model,engine,spec_id)&id=eq.${enc(bookingId)}`);
  const v = b?.vehicles;
  if (!b || !v?.year || !v.make || !v.model) return { ok: false as const, error: "This booking has no car on it" };
  const { rows, down } = await findSpecs(v.year, v.make, v.model, v.engine, opts);
  const oil = rows.filter((r) => r.oil_grade && Number(r.capacity_l) > 0);
  let pick: Spec | undefined = v.engine ? oil.find((r) => engineMatches(v.engine!, r.engine)) : undefined;
  // no engine on the booking: fine if every engine takes the same oil and litres
  if (!pick && !v.engine && oil.length && oil.every((r) => r.oil_grade === oil[0].oil_grade && Number(r.capacity_l) === Number(oil[0].capacity_l))) pick = oil[0];
  if (!pick) {
    const engines = Array.from(new Set(oil.map((r) => r.engine).filter(Boolean))) as string[];
    return { ok: false as const, engines, error: engines.length ? `Found ${engines.join(" and ")}. Check which engine it has under the hood.`
      : down ? "The lookup isn't answering right now. Try again in a few minutes." : "Still not found online. Check under the hood and write it on the job: it's saved for next time." };
  }
  await sbPatch("vehicles", `id=eq.${v.id}`, { spec_id: pick.id });
  const { nearNote } = await import("@/lib/os/quote-service");
  const kept = (b.needs_review ?? []).filter((n) => !NOT_FOUND.test(n) && !/^Oil from our /.test(n));
  await sbPatch("bookings", `id=eq.${b.id}`, { needs_review: pick.near ? [...kept, nearNote(pick)] : kept });
  return { ok: true as const, spec: pick };
}

/** Daily: bookings in the next few days that still have no oil on file. */
export async function attachUpcoming(days = 4) {
  const to = new Date(Date.now() + days * 86400000).toISOString();
  const list = await sbGet<{ id: string; services: { job?: string } | null; vehicles: { spec_id: string | null } | null }>(
    `bookings?select=id,services,vehicles(spec_id)&status=in.(requested,confirmed)&starts_at=gte.${new Date().toISOString()}&starts_at=lt.${to}&limit=60`).catch(() => []);
  let fixed = 0;
  for (const b of list) {
    if (b.vehicles?.spec_id || (b.services?.job && !["oil_change", "seasonal"].includes(b.services.job))) continue;
    if ((await attachSpec(b.id).catch(() => ({ ok: false }))).ok) fixed++;
  }
  return fixed;
}

export const cleanFilter = (x: string | null | undefined) => (x ? x.toUpperCase().trim().replace(/^(PPF|NAPA|PFG)\s*/, "").replace(/\s+/g, "") || null : null);
export const cleanGrade = (g: string) => g.trim().toUpperCase().replace(/\s+/g, " ").replace(/^(\d)W(\d)/, "$1W-$2").replace(/^EURO /, "Euro ").replace(/^DIESEL /, "Diesel ");

/**
 * Owners type in the oil, litres and filter for a car (on a booking, before the job): saved as ours, like a finished job,
 * so the bring list, the cost estimate and the job sheet use it, and every car of the same year/make/model/engine knows it.
 */
export async function setCarOil(vehicleId: string, o: { grade?: string | null; litres?: number | string | null; filter?: string | null;
  cabin?: string | null; air?: string | null; wiperDriver?: string | null; wiperPassenger?: string | null }) {
  const r = await setCarOilOnly(vehicleId, o);
  // the cabin and air filter fit every engine of that car: put them on all its specs, so the website price for
  // that year, make and model uses the filter's retail price whichever engine the customer picks
  if (r.ok && ((o.cabin !== undefined && o.cabin) || (o.air !== undefined && o.air))) {
    const [v] = await sbGet<{ year: number | null; make: string | null; model: string | null }>(`vehicles?select=year,make,model&id=eq.${enc(vehicleId)}`).catch(() => []);
    if (v?.year && v.make && v.model) {
      const specs = await sbGet<{ id: string; year_from: number | null; year_to: number | null }>(
        `vehicle_specs?select=id,year_from,year_to&make=ilike.${enc(v.make)}&model=ilike.${enc(v.model)}&limit=200`).catch(() => []);
      const patch: Record<string, string> = {};
      if (o.cabin) { const c = cleanFilter(o.cabin); if (c) patch.cabin_filter_part = c; }
      if (o.air) { const a = cleanFilter(o.air); if (a) patch.air_filter_part = a; }
      for (const sp of specs.filter((x) => (x.year_from ?? 0) <= v.year! && (x.year_to ?? x.year_from ?? 9999) >= v.year!))
        if (Object.keys(patch).length) await sbPatch("vehicle_specs", `id=eq.${sp.id}`, patch).catch(() => null);
    }
  }
  return r;
}

async function setCarOilOnly(vehicleId: string, o: { grade?: string | null; litres?: number | string | null; filter?: string | null;
  cabin?: string | null; air?: string | null; wiperDriver?: string | null; wiperPassenger?: string | null }) {
  const [v] = await sbGet<{ id: string; year: number | null; make: string | null; model: string | null; engine: string | null;
    spec: { id: string; source: string | null; oil_grade: string | null; capacity_l: number | null; oil_filter_part: string | null; oil_spec: string | null; fuel: string | null;
      cabin_filter_part: string | null; air_filter_part: string | null; wiper_driver: string | null; wiper_passenger: string | null } | null }>(
    `vehicles?select=id,year,make,model,engine,spec:vehicle_specs(id,source,oil_grade,capacity_l,oil_filter_part,oil_spec,fuel,cabin_filter_part,air_filter_part,wiper_driver,wiper_passenger)&id=eq.${enc(vehicleId)}`);
  if (!v) return { ok: false as const, error: "Car not found" };
  if (!v.year || !v.make || !v.model) return { ok: false as const, error: "Add the car's year, make and model first" };
  const grade = o.grade?.trim() ? cleanGrade(o.grade) : v.spec?.oil_grade ?? null;
  const litres = o.litres === undefined || o.litres === null || o.litres === "" ? (v.spec?.capacity_l != null ? Number(v.spec.capacity_l) : null) : Math.round(Number(o.litres) * 10) / 10;
  const filter = o.filter === undefined ? v.spec?.oil_filter_part ?? null : cleanFilter(o.filter);
  // only the add-on parts changed (cabin, air, wipers) and no oil on file yet: save just the parts on this car's spec
  const partsOnly = o.grade === undefined && o.litres === undefined && o.filter === undefined;
  if (!grade && partsOnly) {
    const w = (x: string | null | undefined) => (x ? x.replace(/[^0-9]/g, "").slice(0, 2) || null : null);
    const parts: Record<string, string | null> = {};
    if (o.cabin !== undefined) parts.cabin_filter_part = cleanFilter(o.cabin);
    if (o.air !== undefined) parts.air_filter_part = cleanFilter(o.air);
    if (o.wiperDriver !== undefined) parts.wiper_driver = w(o.wiperDriver);
    if (o.wiperPassenger !== undefined) parts.wiper_passenger = w(o.wiperPassenger);
    if (v.spec) {
      if (!(await sbPatch("vehicle_specs", `id=eq.${v.spec.id}`, parts))) return { ok: false as const, error: "Couldn't save the parts" };
      return { ok: true as const, specId: v.spec.id, grade: null, litres: null, filter: null };
    }
    const r = await sbInsert<{ id: string }>("vehicle_specs", { year_from: v.year, year_to: v.year, make: v.make, model: v.model, engine: v.engine || null, ...parts, source: "job_history", verified: true, times_done: 0 });
    if (!r.ok || !r.data) return { ok: false as const, error: "Couldn't save the parts" };
    await sbPatch("vehicles", `id=eq.${enc(v.id)}`, { spec_id: r.data.id });
    return { ok: true as const, specId: r.data.id, grade: null, litres: null, filter: null };
  }
  if (!grade) return { ok: false as const, error: "Add the oil, like 0W-20" };
  if (!/^(Euro |Diesel )?\d{1,2}W-\d{1,2}$/.test(grade)) return { ok: false as const, error: "Write the oil like 0W-20 or 5W-30" };
  if (!(litres && litres > 0 && litres < 30)) return { ok: false as const, error: "Add how many litres it takes (like 4.4)" };
  // cabin, air and wipers: what they typed, or what the car already had (so moving to our own spec keeps them)
  const wiper = (x: string | null | undefined) => (x ? x.replace(/[^0-9]/g, "").slice(0, 2) || null : null);
  const keepOr = <T,>(given: string | null | undefined, clean: (x: string | null | undefined) => T, had: T) => (given === undefined ? had : clean(given));
  const fields = { oil_grade: grade, capacity_l: litres, oil_filter_part: filter,
    cabin_filter_part: keepOr(o.cabin, cleanFilter, v.spec?.cabin_filter_part ?? null),
    air_filter_part: keepOr(o.air, cleanFilter, v.spec?.air_filter_part ?? null),
    wiper_driver: keepOr(o.wiperDriver, wiper, v.spec?.wiper_driver ?? null),
    wiper_passenger: keepOr(o.wiperPassenger, wiper, v.spec?.wiper_passenger ?? null) };
  let id: string | null = null;
  if (v.spec && (v.spec.source === "job_history" || v.spec.source === "sheet")) {
    id = v.spec.id;   // ours already: correct it (every car linked to it gets the fix)
    if (!(await sbPatch("vehicle_specs", `id=eq.${id}`, fields))) return { ok: false as const, error: "Couldn't save the oil" };
  } else {
    const rows = sameCar(await sbGet<OurRow>(`vehicle_specs?select=id,year_from,make,model,engine,oil_grade,capacity_l,oil_filter_part,source,times_done&source=in.(sheet,job_history)&year_from=lte.${v.year}&year_to=gte.${v.year}&oil_grade=not.is.null`).catch(() => []), v.make, v.model);
    const mine = v.engine ? rows.find((r) => engineMatches(v.engine!, r.engine)) : rows.find((r) => !r.engine) ?? (rows.length === 1 ? rows[0] : undefined);
    if (mine) { id = mine.id; await sbPatch("vehicle_specs", `id=eq.${id}`, fields); }
    else {
      const keep = v.spec && v.spec.oil_grade?.toUpperCase() === grade.toUpperCase() ? { oil_spec: v.spec.oil_spec, fuel: v.spec.fuel } : {};
      const r = await sbInsert<{ id: string }>("vehicle_specs", { year_from: v.year, year_to: v.year, make: v.make, model: v.model, engine: v.engine || null,
        ...fields, source: "job_history", verified: true, times_done: 0, ...keep });
      if (!r.ok || !r.data) return { ok: false as const, error: "Couldn't save the oil" };
      id = r.data.id;
    }
  }
  await sbPatch("vehicles", `id=eq.${enc(v.id)}`, { spec_id: id });
  return { ok: true as const, specId: id, grade, litres, filter };
}

/** What's in Stock for a filter and an oil (shown next to them on the edit screen). */
export async function stockFor(filter: string | null, grade: string | null) {
  const [f] = filter ? await sbGet<{ on_hand: number }>(`parts?select=on_hand&part_number=eq.${enc(filter)}&order=on_hand.desc&limit=1`).catch(() => []) : [];
  const pn = grade ? `OIL-${grade.replace(/^Euro /i, "").toUpperCase()}` : null;
  const [o] = pn ? await sbGet<{ on_hand: number }>(`parts?select=on_hand&part_number=eq.${enc(pn)}&order=on_hand.desc&limit=1`).catch(() => []) : [];
  return { filter: f ? Number(f.on_hand) : null, oil: o ? Number(o.on_hand) : null };
}
