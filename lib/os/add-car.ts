// On site: the customer asks us to do another car too. Adds it to the visit that's already started:
// same customer and address, right after the last car, no second travel fee, no booking text,
// and it's started straight away so it shows as "Car 2 of 2" with one bill at the end.
import crypto from "crypto";
import { sbGet, sbPatch, enc } from "@/lib/os/db";
import { createBooking } from "@/lib/os/booking";

export type AddCar = { year: number; make: string; model: string; engine?: string; job?: "oil_change" | "seasonal" | "parts" | "diagnostic" | "tires" | "rotation"; addons?: string[]; own?: "both" | "oil" | "filter" | null };

export async function addCarToVisit(bookingId: string, car: AddCar, owner: string) {
  const [b] = await sbGet<{ id: string; status: string; group_id: string | null; customer_id: string | null; fleet_account_id: string | null; address: string | null; starts_at: string; ends_at: string;
    customers: { first_name: string | null; last_name: string | null; phone: string | null; email: string | null } | null }>(
    `bookings?select=id,status,group_id,customer_id,fleet_account_id,address,starts_at,ends_at,customers(first_name,last_name,phone,email)&id=eq.${enc(bookingId)}`);
  if (!b) return { ok: false as const, error: "Booking not found" };
  if (b.fleet_account_id) return { ok: false as const, error: "For a fleet, book the van from the fleet's page" };
  if (!["in_progress", "confirmed", "requested"].includes(b.status)) return { ok: false as const, error: "This visit is already finished. Make a new booking for the other car." };
  const c = b.customers;
  if (!c?.phone || !b.address) return { ok: false as const, error: "Add their phone and address on the booking first" };

  // the visit: every car on it (one car so far = start a visit now)
  const groupId = b.group_id ?? crypto.randomUUID();
  if (!b.group_id) await sbPatch("bookings", `id=eq.${enc(b.id)}`, { group_id: groupId });
  const cars = await sbGet<{ ends_at: string }>(`bookings?select=ends_at&group_id=eq.${groupId}&status=neq.cancelled&order=ends_at.desc&limit=1`).catch(() => []);
  // right after the last car, rounded up to the next minute (the database keeps microseconds, so the same instant can overlap)
  const after = Math.max(new Date(cars[0]?.ends_at ?? b.ends_at).getTime(), Date.now());
  const start = new Date(Math.ceil((after + 1) / 60000) * 60000).toISOString();

  const r = await createBooking({
    firstName: c.first_name || "Customer", lastName: c.last_name || "", phone: c.phone, email: c.email || "", address: b.address,
    car: { year: car.year, make: car.make.trim(), model: car.model.trim(), ...(car.engine?.trim() ? { engine: car.engine.trim() } : {}) },
    job: car.job ?? "oil_change", addons: (car.addons ?? []) as never, own: car.own ?? null, start, cars: 1, payMode: "after",
    notes: "Added on site",
  }, { source: "phone", bookedBy: owner, anyTime: true, groupId, noTravel: true, silent: true, customerId: b.customer_id });
  if (!r.ok) { return { ok: false as const, error: r.status === 409 ? "There's another booking right after this one, so there's no room. Move that one first, or make a separate booking." : r.error }; }
  // we're already there: start it now so it's part of the job in progress
  if (b.status === "in_progress") await sbPatch("bookings", `id=eq.${enc(r.bookingId)}`, { status: "in_progress", started_at: new Date().toISOString() });
  return { ok: true as const, bookingId: r.bookingId, total: r.total, car: r.car };
}
