// Calendar alerts (new bookings etc). GET = latest 30, POST {ids} or {all:true} = mark read.
import { NextRequest, NextResponse } from "next/server";
import { currentOwner } from "@/lib/os/auth";
import { sbGet, sbHeaders } from "@/lib/os/db";

export const dynamic = "force-dynamic";
const base = () => process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";

export async function GET() {
  if (!currentOwner()) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const rows = await sbGet<{ read_at: string | null }>(`notifications?select=id,kind,title,body,booking_id,created_at,read_at,bookings(starts_at)&order=created_at.desc&limit=30`);
  return NextResponse.json({ alerts: rows, unread: rows.filter((r) => !r.read_at).length });
}

export async function POST(req: NextRequest) {
  if (!currentOwner()) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const { ids, all } = await req.json().catch(() => ({}));
  const filter = all ? "read_at=is.null" : `id=in.(${(ids || []).map((x: string) => x.replace(/[^a-f0-9-]/gi, "")).join(",")})`;
  const res = await fetch(`${base()}/rest/v1/notifications?${filter}`, {
    method: "PATCH", headers: sbHeaders({ "Content-Type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify({ read_at: new Date().toISOString() }),
  });
  return NextResponse.json({ ok: res.ok });
}
