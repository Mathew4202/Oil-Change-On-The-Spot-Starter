// One-time import: Square customers + bookings -> Supabase.
// Run by visiting /api/admin/import-square?key=ADMIN_SECRET on the preview site.
// Safe to run more than once: rows are matched on their Square IDs.
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SQ = "https://connect.squareup.com/v2";

function sqHeaders() {
  return {
    Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
    "Square-Version": "2025-01-23",
    "Content-Type": "application/json",
  };
}

async function sqAll<T>(path: string, key: string): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  do {
    const sep = path.includes("?") ? "&" : "?";
    const url = `${SQ}${path}${cursor ? `${sep}cursor=${encodeURIComponent(cursor)}` : ""}`;
    const res = await fetch(url, { headers: sqHeaders(), cache: "no-store" });
    if (!res.ok) throw new Error(`Square ${path}: ${res.status} ${await res.text()}`);
    const json = await res.json();
    out.push(...((json[key] as T[]) ?? []));
    cursor = json.cursor;
  } while (cursor);
  return out;
}

const SB_KEY = () => process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
// New Supabase secret keys (sb_secret_...) go only in the apikey header; old JWT keys also go in Authorization.
function sbHeaders(extra: Record<string, string> = {}) {
  const k = SB_KEY();
  return { apikey: k, ...(k.startsWith("eyJ") ? { Authorization: `Bearer ${k}` } : {}), ...extra };
}

async function upsert(table: string, rows: object[], onConflict: string) {
  if (!rows.length) return 0;
  const url = `${process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`;
  for (let i = 0; i < rows.length; i += 200) {
    const res = await fetch(url, {
      method: "POST",
      headers: sbHeaders({
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      }),
      body: JSON.stringify(rows.slice(i, i + 200)),
    });
    if (!res.ok) throw new Error(`Supabase ${table}: ${res.status} ${await res.text()}`);
  }
  return rows.length;
}

async function idMap(table: string, col: string): Promise<Map<string, string>> {
  const res = await fetch(`${process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${table}?select=id,${col}&limit=10000`, {
    headers: sbHeaders(),
  });
  const rows: Record<string, string>[] = await res.json();
  return new Map(rows.filter((r) => r[col]).map((r) => [r[col], r.id]));
}

const clean = (s?: string) => (s ? s.replace(/\s+/g, " ").trim() : null);

export async function GET(req: NextRequest) {
  if (!process.env.ADMIN_SECRET || req.nextUrl.searchParams.get("key") !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "not allowed" }, { status: 401 });
  }

  try {
    // ---- Customers ----
    type SqCustomer = {
      id: string; given_name?: string; family_name?: string; email_address?: string;
      phone_number?: string; note?: string;
      address?: { address_line_1?: string; locality?: string; postal_code?: string };
    };
    const sqCustomers = await sqAll<SqCustomer>("/customers?limit=100", "customers");

    const seenPhones = new Set<string>();
    const dupes: string[] = [];
    const customers = sqCustomers.map((c) => {
      let phone = c.phone_number ?? null;
      let note = clean(c.note);
      if (phone && seenPhones.has(phone)) {
        dupes.push(`${clean(c.given_name)} ${clean(c.family_name) ?? ""}`.trim());
        note = [note, `Same phone as another customer: ${phone}`].filter(Boolean).join(" | ");
        phone = null; // phone must be unique for SMS login
      }
      if (phone) seenPhones.add(phone);
      return {
        square_customer_id: c.id,
        first_name: clean(c.given_name),
        last_name: clean(c.family_name),
        email: clean(c.email_address)?.toLowerCase() ?? null,
        phone,
        address: clean(c.address?.address_line_1),
        city: clean(c.address?.locality),
        postal_code: clean(c.address?.postal_code)?.toUpperCase().replace(/\s/g, "") ?? null,
        notes: note,
      };
    });
    const nCustomers = await upsert("customers", customers, "square_customer_id");

    // ---- Bookings (all history) ----
    type SqBooking = {
      id: string; start_at: string; status: string; customer_id?: string; customer_note?: string;
      seller_note?: string; location_type?: string; address?: { address_line_1?: string };
      appointment_segments?: { duration_minutes?: number }[];
    };
    const custIds = await idMap("customers", "square_customer_id");
    const statusMap: Record<string, string> = {
      ACCEPTED: "confirmed", PENDING: "requested", CANCELLED_BY_CUSTOMER: "cancelled",
      CANCELLED_BY_SELLER: "cancelled", DECLINED: "cancelled", NO_SHOW: "no_show",
    };

    // Square only lets us list 31 days at a time, so walk month by month from launch.
    const sqBookings: SqBooking[] = [];
    const end = new Date(Date.now() + 90 * 86400000);
    for (let d = new Date("2025-07-01T00:00:00Z"); d < end; d = new Date(d.getTime() + 30 * 86400000)) {
      const to = new Date(d.getTime() + 30 * 86400000);
      const loc = process.env.SQUARE_LOCATION_ID ? `&location_id=${process.env.SQUARE_LOCATION_ID}` : "";
      sqBookings.push(
        ...(await sqAll<SqBooking>(
          `/bookings?limit=100&start_at_min=${d.toISOString()}&start_at_max=${to.toISOString()}${loc}`,
          "bookings",
        )),
      );
    }
    const now = Date.now();
    const bookings = [...new Map(sqBookings.map((b) => [b.id, b])).values()].map((b) => {
      const mins = (b.appointment_segments ?? []).reduce((s, x) => s + (x.duration_minutes ?? 0), 0) || 60;
      const start = new Date(b.start_at);
      let status = statusMap[b.status] ?? "requested";
      if (status === "confirmed" && start.getTime() < now) status = "done";
      return {
        square_booking_id: b.id,
        customer_id: b.customer_id ? custIds.get(b.customer_id) ?? null : null,
        starts_at: start.toISOString(),
        ends_at: new Date(start.getTime() + mins * 60000).toISOString(),
        address: clean(b.address?.address_line_1),
        status,
        source: "square_import",
        notes: [clean(b.customer_note), clean(b.seller_note)].filter(Boolean).join(" | ") || null,
      };
    });
    const nBookings = await upsert("bookings", bookings, "square_booking_id");

    return NextResponse.json({
      ok: true,
      customers: nCustomers,
      bookings: nBookings,
      shared_phone_numbers: dupes,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
