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
  } else if (!mine) {
    // first time we've done this car (or this engine): save it as ours. Keep the oil approval / diesel flag from the online lookup.
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
  await sbPatch("bookings", `id=eq.${b.id}`, { needs_review: (b.needs_review ?? []).filter((n) => !NOT_FOUND.test(n)) });
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
