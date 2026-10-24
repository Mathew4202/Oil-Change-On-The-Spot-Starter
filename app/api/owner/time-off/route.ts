// Block time so customers can't book it. POST {date, from:"13:00", to:"17:00", reason} ; DELETE ?id=
import { NextRequest, NextResponse } from "next/server";
import { currentOwner } from "@/lib/os/auth";
import { sbInsert, sbHeaders } from "@/lib/os/db";
import { halifaxToDate } from "@/lib/os/slots";

const base = () => process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };

export async function POST(req: NextRequest) {
  const owner = currentOwner();
  if (!owner) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const { date, from, to, reason } = await req.json().catch(() => ({}));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !/^\d{1,2}:\d{2}$/.test(from || "") || !/^\d{1,2}:\d{2}$/.test(to || "") || toMin(to) <= toMin(from)) {
    return NextResponse.json({ error: "Pick a day and a start and end time" }, { status: 400 });
  }
  const r = await sbInsert("time_off", {
    starts_at: halifaxToDate(date, toMin(from)).toISOString(), ends_at: halifaxToDate(date, toMin(to)).toISOString(),
    reason: `${reason ? String(reason).slice(0, 100) : "Blocked"} (${owner})`,
  });
  return NextResponse.json(r.ok ? { ok: true } : { error: "Could not save" }, { status: r.ok ? 200 : 500 });
}

export async function DELETE(req: NextRequest) {
  if (!currentOwner()) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const id = (req.nextUrl.searchParams.get("id") || "").replace(/[^a-f0-9-]/gi, "");
  const res = await fetch(`${base()}/rest/v1/time_off?id=eq.${id}`, { method: "DELETE", headers: sbHeaders() });
  return NextResponse.json({ ok: res.ok });
}
