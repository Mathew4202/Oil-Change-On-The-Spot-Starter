// Square → HQ: customers and appointments booked in Square show up in HQ (until the switchover, when Square goes away).
// Runs every evening with the daily job (last few days to 2 months ahead), from the owners' button, and in full from
// /api/admin/import-square. Rows are matched on their Square IDs, so running it again only updates.
// A customer the Job Tracker import added by name only (no phone) gets the Square details instead of a second copy.
import { sbGet, sbInsert, sbPatch, enc } from "@/lib/os/db";
import { carsFromText, type CarText } from "@/lib/os/car-text";

const SQ = process.env.SQUARE_BASE_URL || "https://connect.squareup.com/v2";   // the override is for tests
const sqHeaders = () => ({ Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`, "Square-Version": "2025-01-23", "Content-Type": "application/json" });
export const squareReady = () => !!process.env.SQUARE_ACCESS_TOKEN;

async function sqAll<T>(path: string, key: string): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  do {
    const sep = path.includes("?") ? "&" : "?";
    const res = await fetch(`${SQ}${path}${cursor ? `${sep}cursor=${encodeURIComponent(cursor)}` : ""}`, { headers: sqHeaders(), cache: "no-store" });
    if (!res.ok) throw new Error(`Square ${path.split("?")[0]}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    out.push(...((json[key] as T[]) ?? []));
    cursor = json.cursor;
  } while (cursor);
  return out;
}

const clean = (s?: string | null) => (s ? s.replace(/\s+/g, " ").trim() : null);
const key = (a?: string | null, b?: string | null) => `${clean(a) ?? ""} ${clean(b) ?? ""}`.toLowerCase().replace(/\s+/g, " ").trim();

type SqCustomer = { id: string; given_name?: string; family_name?: string; email_address?: string; phone_number?: string; note?: string;
  address?: { address_line_1?: string; locality?: string; postal_code?: string } };
type SqBooking = { id: string; start_at: string; status: string; customer_id?: string; customer_note?: string; seller_note?: string;
  address?: { address_line_1?: string }; appointment_segments?: { duration_minutes?: number; service_variation_id?: string }[] };
const STATUS: Record<string, string> = { ACCEPTED: "confirmed", PENDING: "requested", CANCELLED_BY_CUSTOMER: "cancelled",
  CANCELLED_BY_SELLER: "cancelled", DECLINED: "cancelled", NO_SHOW: "no_show" };

/** Bring Square customers and the appointments between `from` and `to` into HQ. */
export async function syncSquare(from: Date, to: Date) {
  if (!squareReady()) return { ok: false, note: "SQUARE_ACCESS_TOKEN isn't set (fine after the switchover)" };
  // ---- customers ----
  const sq = await sqAll<SqCustomer>("/customers?limit=100", "customers");
  const have = await sbGet<{ id: string; square_customer_id: string | null; phone: string | null; first_name: string | null; last_name: string | null; source: string | null; address?: string | null }>(
    "customers?select=id,square_customer_id,phone,first_name,last_name,source,address&limit=10000");
  const bySq = new Map(have.filter((c) => c.square_customer_id).map((c) => [c.square_customer_id!, c]));
  const phones = new Map(have.filter((c) => c.phone).map((c) => [c.phone!, c]));
  const nameOnly = new Map<string, typeof have[number]>();
  for (const c of have) if (!c.phone && !c.square_customer_id) { const k = key(c.first_name, c.last_name); if (k && !nameOnly.has(k)) nameOnly.set(k, c); }
  let added = 0, updated = 0, merged = 0;
  for (const c of sq) {
    const row: Record<string, unknown> = {
      square_customer_id: c.id, first_name: clean(c.given_name), last_name: clean(c.family_name),
      email: clean(c.email_address)?.toLowerCase() ?? null, address: clean(c.address?.address_line_1), city: clean(c.address?.locality),
      postal_code: clean(c.address?.postal_code)?.toUpperCase().replace(/\s/g, "") ?? null,
    };
    const phone = c.phone_number ?? null;
    const mine = bySq.get(c.id);
    const owner = phone ? phones.get(phone) : undefined;
    if (mine) { updated++; continue; }   // already in HQ (HQ's copy may have newer details, so it's left as it is)
    // same phone and same name already in HQ under another Square ID (a merged Square profile): that's them
    if (owner && owner.square_customer_id && key(owner.first_name, owner.last_name) === key(c.given_name, c.family_name)) { bySq.set(c.id, owner); updated++; continue; }
    // same phone already in HQ (booked on the website, or added by hand): link it instead of adding a copy
    const target = owner && !owner.square_customer_id ? owner : nameOnly.get(key(c.given_name, c.family_name));
    if (target) {
      const patch: Record<string, unknown> = Object.fromEntries(Object.entries(row).filter(([, v]) => v != null));
      if (phone && !owner) patch.phone = phone;
      await sbPatch("customers", `id=eq.${target.id}`, patch).catch(() => null);
      bySq.set(c.id, { ...target, square_customer_id: c.id, address: target.address || (row.address as string | null) }); if (phone && !owner) phones.set(phone, target);
      nameOnly.delete(key(c.given_name, c.family_name)); merged++;
      continue;
    }
    const ins = await sbInsert<{ id: string }>("customers", { ...row, phone: phone && !owner ? phone : null, source: "square",
      notes: owner ? `Same phone as another customer: ${phone}` : clean(c.note) }).catch(() => null);
    if (ins?.ok && ins.data) { bySq.set(c.id, { id: ins.data.id, square_customer_id: c.id, phone, first_name: null, last_name: null, source: "square", address: row.address as string | null }); if (phone && !owner) phones.set(phone, bySq.get(c.id)!); added++; }
  }

  // ---- appointments (Square only lists 31 days at a time) ----
  const list: SqBooking[] = [];
  const loc = process.env.SQUARE_LOCATION_ID ? `&location_id=${process.env.SQUARE_LOCATION_ID}` : "";
  for (let d = new Date(from); d < to; d = new Date(d.getTime() + 30 * 86400000)) {
    const end = new Date(Math.min(d.getTime() + 30 * 86400000, to.getTime()));
    list.push(...(await sqAll<SqBooking>(`/bookings?limit=100&start_at_min=${d.toISOString()}&start_at_max=${end.toISOString()}${loc}`, "bookings")));
  }
  const [rule] = await sbGet<{ value: number }>("pricing_rules?select=value&key=eq.job_minutes").catch(() => []);
  const perCar = Number(rule?.value ?? 75);
  const jobs = await serviceJobs(list.flatMap((b) => (b.appointment_segments ?? []).map((x) => x.service_variation_id).filter(Boolean) as string[]));
  const existing = new Map((await sbGet<{ id: string; square_booking_id: string | null; status: string; vehicle_id: string | null; quoted_total: number | null }>(
    "bookings?select=id,square_booking_id,status,vehicle_id,quoted_total&square_booking_id=not.is.null&limit=10000")).map((b) => [b.square_booking_id!, b]));
  const toPrice: { id: string; cars: CarText[]; job: string; addons: string[]; date: string }[] = [];
  let bAdded = 0, bUpdated = 0, carsAdded = 0;
  const lookUp: string[] = [];
  const now = Date.now();
  for (const b of [...new Map(list.map((x) => [x.id, x])).values()]) {
    const segs = b.appointment_segments ?? [];
    // Square's 30-minute services are shorter than a real visit: block at least our usual time per car so HQ can't double-book
    const mins = Math.max(segs.reduce((s, x) => s + (x.duration_minutes ?? 0), 0), perCar * Math.max(1, segs.length));
    const start = new Date(b.start_at);
    let status = STATUS[b.status] ?? "requested";
    if (status === "confirmed" && start.getTime() < now) status = "done";
    const cust = b.customer_id ? bySq.get(b.customer_id) : undefined;
    // the job: from the Square service's name (oil change unless it says tires, diagnostic...)
    const kinds = segs.map((x) => (x.service_variation_id ? jobs.get(x.service_variation_id) : undefined) ?? "oil_change");
    const job = kinds.includes("oil_change") ? "oil_change" : kinds[0] ?? "oil_change";
    const cars = carsFromText([b.seller_note, b.customer_note].filter(Boolean).join("\n"));
    const row: Record<string, unknown> = { square_booking_id: b.id, customer_id: cust?.id ?? null,
      starts_at: start.toISOString(), ends_at: new Date(start.getTime() + mins * 60000).toISOString(),
      address: clean(b.address?.address_line_1) ?? clean(cust?.address) ?? null,   // at their place: the customer's address
      status, source: "square_import", cars: Math.max(1, segs.length, cars.length), services: { job, ...(kinds.includes("tires") && job === "oil_change" ? { addons: ["tires"] } : {}) },
      notes: [clean(b.customer_note), clean(b.seller_note)].filter(Boolean).join(" | ") || null };
    const old = existing.get(b.id);
    let id: string | null = old?.id ?? null;
    if (old) {
      // a job HQ already finished stays finished; a car HQ already set stays
      const patch: Record<string, unknown> = { ...row };
      if (!row.address) delete patch.address;
      if (old.status === "done" || old.status === "in_progress") delete patch.status;
      await sbPatch("bookings", `id=eq.${old.id}`, patch).catch(() => null); bUpdated++;
    } else {
      const ins = await sbInsert<{ id: string }>("bookings", row).catch(() => null);
      if (ins?.ok && ins.data) { bAdded++; id = ins.data.id; }
    }
    // no price yet (Square doesn't send one): price it the way HQ prices a booking, for the calendar's booked and profit
    if (id && !old?.quoted_total && start.getTime() > now - 86400000 && status !== "cancelled" && (cars.length || job !== "oil_change"))
      toPrice.push({ id, cars, job, addons: job === "oil_change" && kinds.includes("tires") ? ["tires"] : [], date: start.toISOString().slice(0, 10) });
    // the car(s) from the note become the customer's cars, and the first one goes on the booking (so the oil can be looked up)
    if (id && cust && cars.length && !old?.vehicle_id) {
      let first: string | null = null;
      for (const car of cars) {
        const v = await carFor(cust.id, car);
        if (v.added) carsAdded++;
        first = first ?? v.id;
      }
      if (first) {
        await sbPatch("bookings", `id=eq.${id}`, { vehicle_id: first }).catch(() => null);
        if (start.getTime() > now && status !== "cancelled" && job === "oil_change") lookUp.push(id);
      }
    }
  }
  let priced = 0;
  for (const p of toPrice.slice(0, 12)) if (await priceBooking(p).catch(() => false)) priced++;
  // upcoming oil changes: look up the oil now (the evening job catches any left over)
  let oil = 0;
  if (lookUp.length) {
    const { attachSpec } = await import("@/lib/os/spec-learn");
    for (const id of lookUp.slice(0, 6)) { const r = await attachSpec(id).catch(() => null); if (r && (r as { ok?: boolean }).ok) oil++; }
  }
  return { ok: true, customers: { added, already: updated, linked: merged }, bookings: { added: bAdded, updated: bUpdated }, cars: carsAdded, priced, oilFound: oil };
}

/** The customer's car, added if it isn't there yet (matched on year, make and model). */
async function carFor(customerId: string, car: CarText): Promise<{ id: string; added: boolean }> {
  const q = [`customer_id=eq.${customerId}`, car.make ? `make=ilike.${enc(car.make)}` : "", car.model ? `model=ilike.${enc(car.model)}` : "", car.year ? `year=eq.${car.year}` : ""].filter(Boolean).join("&");
  const [v] = await sbGet<{ id: string; engine: string | null }>(`vehicles?select=id,engine&${q}&limit=1`).catch(() => []);
  if (v) { if (!v.engine && car.engine) await sbPatch("vehicles", `id=eq.${v.id}`, { engine: car.engine }).catch(() => null); return { id: v.id, added: false }; }
  const ins = await sbInsert<{ id: string }>("vehicles", { customer_id: customerId, year: car.year, make: car.make, model: car.model, engine: car.engine, source: "square" });
  if (!ins.ok || !ins.data) throw new Error("couldn't add the car");
  return { id: ins.data.id, added: true };
}

/** Square service → HQ job type, from the service's name ("Tire change on rim (sedan)" → tires). */
async function serviceJobs(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const uniq = [...new Set(ids)];
  if (!uniq.length) return out;
  try {
    const res = await fetch(`${SQ}/catalog/batch-retrieve`, { method: "POST", headers: sqHeaders(), body: JSON.stringify({ object_ids: uniq, include_related_objects: true }) });
    if (!res.ok) return out;
    const j = await res.json() as { objects?: { id: string; item_variation_data?: { name?: string; item_id?: string } }[]; related_objects?: { id: string; item_data?: { name?: string } }[] };
    const items = new Map((j.related_objects ?? []).map((o) => [o.id, o.item_data?.name ?? ""]));
    for (const o of j.objects ?? []) {
      const name = `${items.get(o.item_variation_data?.item_id ?? "") ?? ""} ${o.item_variation_data?.name ?? ""}`.toLowerCase();
      out.set(o.id, /tire|tyre|rim/.test(name) ? "tires" : /diagnos/.test(name) ? "diagnostic" : /rotation/.test(name) ? "rotation" : /seasonal/.test(name) ? "seasonal" : "oil_change");
    }
  } catch { /* names unknown: oil change */ }
  return out;
}

/** Price a Square appointment with HQ's prices (each car on the visit), so the calendar shows booked and profit. */
async function priceBooking(p: { id: string; cars: CarText[]; job: string; addons: string[]; date: string }) {
  const { buildQuote } = await import("@/lib/os/quote-service");
  const list = p.cars.length ? p.cars : [{ year: null, make: null, model: null, engine: null }];
  const quotes = [];
  for (const c of list) {
    if (p.job === "oil_change" && !(c.year && c.make && c.model)) return false;   // can't price an oil change without the car
    const { quote } = await buildQuote({ year: c.year ?? 2018, make: c.make ?? "", model: c.model ?? "", engine: c.engine,
      job: p.job as "oil_change", addons: p.addons as never[], km: null, date: p.date });
    quotes.push({ c, quote });
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const many = quotes.length > 1;
  const lines = quotes.flatMap(({ c, quote }) => quote.lines.map((l) => ({ ...l, label: many ? `${[c.year, c.make, c.model].filter(Boolean).join(" ")}: ${l.label}` : l.label })));
  const subtotal = r2(quotes.reduce((t, q) => t + q.quote.subtotal, 0)), hst = r2(quotes.reduce((t, q) => t + q.quote.hst, 0));
  const profit = quotes.every((q) => q.quote.profit != null) ? r2(quotes.reduce((t, q) => t + (q.quote.profit ?? 0), 0)) : null;
  const breakdown = { ...quotes[0].quote, lines, subtotal, hst, total: r2(subtotal + hst), profit,
    needsReview: [...new Set(quotes.flatMap((q) => q.quote.needsReview ?? []))] };
  return sbPatch("bookings", `id=eq.${p.id}`, { quoted_total: breakdown.total, quote_breakdown: breakdown });
}
