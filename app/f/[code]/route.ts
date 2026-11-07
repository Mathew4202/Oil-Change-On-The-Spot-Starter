// Short link for the "we'll be in your area" text: /f/<first 8 of the customer id><YYMMDD>.
// Opens the booking page for that day with their name, address, phone and car already filled in.
// (The long pre-filled link made each of those texts 3 segments on Quo; this keeps it to 1 or 2.)
import { NextRequest, NextResponse } from "next/server";
import { sbGet, enc } from "@/lib/os/db";

export const dynamic = "force-dynamic";

type Car = { year: number | null; make: string | null; model: string | null; engine: string | null };

export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const home = new URL("/booking", req.nextUrl.origin);
  const m = /^([0-9a-f]{8})(\d{2})(\d{2})(\d{2})$/i.exec(params.code || "");
  if (!m) return NextResponse.redirect(home);
  const date = `20${m[2]}-${m[3]}-${m[4]}`;
  home.searchParams.set("date", date);
  const p = m[1].toLowerCase();
  const [c] = await sbGet<{ id: string; first_name: string | null; last_name: string | null; phone: string | null; email: string | null; address: string | null }>(
    `customers?select=id,first_name,last_name,phone,email,address&id=gte.${p}-0000-0000-0000-000000000000&id=lte.${p}-ffff-ffff-ffff-ffffffffffff&limit=2`).catch(() => []);
  if (!c) return NextResponse.redirect(home);
  const [last] = await sbGet<{ vehicles: Car | null }>(`jobs?select=vehicles(year,make,model,engine)&customer_id=eq.${enc(c.id)}&order=done_at.desc&limit=1`).catch(() => []);
  const v = last?.vehicles ?? (await sbGet<Car>(`vehicles?select=year,make,model,engine&customer_id=eq.${enc(c.id)}&order=created_at.desc&limit=1`).catch(() => []))[0];
  if (v?.year && v.make) { home.searchParams.set("year", String(v.year)); home.searchParams.set("make", v.make); if (v.model) home.searchParams.set("model", v.model); }
  if (v?.engine) home.searchParams.set("engine", v.engine);
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim(); if (name) home.searchParams.set("name", name);
  if (c.address) home.searchParams.set("address", c.address);
  if (c.email) home.searchParams.set("email", c.email);
  if (c.phone) home.searchParams.set("phone", c.phone.replace(/^\+1/, ""));
  return NextResponse.redirect(home);
}
