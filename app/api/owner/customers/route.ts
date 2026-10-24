// Find a customer by name or phone, with their saved cars (for booking returning customers fast).
import { NextRequest, NextResponse } from "next/server";
import { currentOwner } from "@/lib/os/auth";
import { sbGet, enc } from "@/lib/os/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!currentOwner()) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const q = (req.nextUrl.searchParams.get("q") || "").trim().replace(/[,()*]/g, " ").slice(0, 40);
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
