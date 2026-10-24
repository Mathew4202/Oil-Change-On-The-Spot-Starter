// GET ?q= → quick search (booking form) · ?list=1 → everyone with visits / spend / next due · ?id= → one customer
// PATCH {id, ...fields} → edit · POST {action:"merge", from, into} → same person twice
import { NextRequest, NextResponse } from "next/server";
import { currentOwner } from "@/lib/os/auth";
import { sbGet, enc } from "@/lib/os/db";
import { listCustomers, customerDetail, updateCustomer, mergeCustomers } from "@/lib/os/customers";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(req: NextRequest) {
  if (!currentOwner()) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  if (sp.get("list")) return NextResponse.json({ customers: await listCustomers() });
  const id = sp.get("id");
  if (id) {
    if (!UUID.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
    if (sp.get("brief")) {   // for opening the booking form with this customer
      const [c] = await sbGet(`customers?select=id,first_name,last_name,phone,email,address,vehicles(id,year,make,model,engine)&id=eq.${enc(id)}`);
      return c ? NextResponse.json({ customer: c }) : NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const d = await customerDetail(id);
    return d ? NextResponse.json(d) : NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const q = (sp.get("q") || "").trim().replace(/[,()*]/g, " ").slice(0, 40);
  if (q.length < 2) return NextResponse.json({ customers: [] });
  const digits = q.replace(/\D/g, "");
  const words = q.split(/\s+/).filter(Boolean);
  const ors = digits.length >= 3
    ? [`phone.ilike.*${digits}*`]
    : words.length > 1
      ? [`and(first_name.ilike.*${words[0]}*,last_name.ilike.*${words.slice(1).join(" ")}*)`, `first_name.ilike.*${q}*`]
      : [`first_name.ilike.*${q}*`, `last_name.ilike.*${q}*`];
  const rows = await sbGet(
    `customers?select=id,first_name,last_name,phone,email,address,vehicles(id,year,make,model,engine)` +
    `&or=(${enc(ors.join(","))})&order=first_name&limit=8`);
  return NextResponse.json({ customers: rows });
}

export async function PATCH(req: NextRequest) {
  const owner = currentOwner();
  if (!owner) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (!UUID.test(String(b.id || ""))) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const r = await updateCustomer(b.id, { firstName: str(b.firstName), lastName: str(b.lastName), phone: str(b.phone), email: str(b.email),
    address: str(b.address), notes: str(b.notes), smsOff: typeof b.smsOff === "boolean" ? b.smsOff : undefined }, owner);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}

export async function POST(req: NextRequest) {
  if (!currentOwner()) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (b.action !== "merge" || !UUID.test(String(b.from || "")) || !UUID.test(String(b.into || ""))) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const r = await mergeCustomers(b.from, b.into);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
