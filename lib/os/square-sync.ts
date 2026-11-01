// Square → HQ: customers and appointments booked in Square show up in HQ (until the switchover, when Square goes away).
// Runs every evening with the daily job (last few days to 2 months ahead), from the owners' button, and in full from
// /api/admin/import-square. Rows are matched on their Square IDs, so running it again only updates.
// A customer the Job Tracker import added by name only (no phone) gets the Square details instead of a second copy.
import { sbGet, sbInsert, sbPatch } from "@/lib/os/db";

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
  address?: { address_line_1?: string }; appointment_segments?: { duration_minutes?: number }[] };
const STATUS: Record<string, string> = { ACCEPTED: "confirmed", PENDING: "requested", CANCELLED_BY_CUSTOMER: "cancelled",
  CANCELLED_BY_SELLER: "cancelled", DECLINED: "cancelled", NO_SHOW: "no_show" };

/** Bring Square customers and the appointments between `from` and `to` into HQ. */
export async function syncSquare(from: Date, to: Date) {
  if (!squareReady()) return { ok: false, note: "SQUARE_ACCESS_TOKEN isn't set (fine after the switchover)" };
  // ---- customers ----
  const sq = await sqAll<SqCustomer>("/customers?limit=100", "customers");
  const have = await sbGet<{ id: string; square_customer_id: string | null; phone: string | null; first_name: string | null; last_name: string | null; source: string | null }>(
    "customers?select=id,square_customer_id,phone,first_name,last_name,source&limit=10000");
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
      bySq.set(c.id, { ...target, square_customer_id: c.id }); if (phone && !owner) phones.set(phone, target);
      nameOnly.delete(key(c.given_name, c.family_name)); merged++;
      continue;
    }
    const ins = await sbInsert<{ id: string }>("customers", { ...row, phone: phone && !owner ? phone : null, source: "square",
      notes: owner ? `Same phone as another customer: ${phone}` : clean(c.note) }).catch(() => null);
    if (ins?.ok && ins.data) { bySq.set(c.id, { id: ins.data.id, square_customer_id: c.id, phone, first_name: null, last_name: null, source: "square" }); if (phone && !owner) phones.set(phone, bySq.get(c.id)!); added++; }
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
  const existing = new Map((await sbGet<{ id: string; square_booking_id: string | null; status: string }>(
    "bookings?select=id,square_booking_id,status&square_booking_id=not.is.null&limit=10000")).map((b) => [b.square_booking_id!, b]));
  let bAdded = 0, bUpdated = 0;
  const now = Date.now();
  for (const b of [...new Map(list.map((x) => [x.id, x])).values()]) {
    const segs = b.appointment_segments ?? [];
    // Square's 30-minute services are shorter than a real visit: block at least our usual time per car so HQ can't double-book
    const mins = Math.max(segs.reduce((s, x) => s + (x.duration_minutes ?? 0), 0), perCar * Math.max(1, segs.length));
    const start = new Date(b.start_at);
    let status = STATUS[b.status] ?? "requested";
    if (status === "confirmed" && start.getTime() < now) status = "done";
    const row = { square_booking_id: b.id, customer_id: b.customer_id ? bySq.get(b.customer_id)?.id ?? null : null,
      starts_at: start.toISOString(), ends_at: new Date(start.getTime() + mins * 60000).toISOString(), address: clean(b.address?.address_line_1),
      status, source: "square_import", cars: Math.max(1, segs.length),
      notes: [clean(b.customer_note), clean(b.seller_note)].filter(Boolean).join(" | ") || null };
    const old = existing.get(b.id);
    if (old) {
      // a job HQ already finished stays finished
      const patch: Record<string, unknown> = { ...row, address: row.address ?? undefined };
      if (old.status === "done" || old.status === "in_progress") delete patch.status;
      await sbPatch("bookings", `id=eq.${old.id}`, patch).catch(() => null); bUpdated++;
    } else {
      const ins = await sbInsert("bookings", row).catch(() => null);
      if (ins?.ok) bAdded++;
    }
  }
  return { ok: true, customers: { added, already: updated, linked: merged }, bookings: { added: bAdded, updated: bUpdated } };
}
