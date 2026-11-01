// POST → pull customers and appointments from Square now (owners only: not listed in roles.ts).
import { NextResponse } from "next/server";
import { isOwner } from "@/lib/os/auth";
import { syncSquare } from "@/lib/os/square-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  if (!isOwner()) return NextResponse.json({ error: "Owners only" }, { status: 403 });
  try {
    // from the start of October (everything since the last import) to two months ahead
    return NextResponse.json(await syncSquare(new Date("2026-10-01T00:00:00Z"), new Date(Date.now() + 60 * 86400000)));
  } catch (e) { return NextResponse.json({ ok: false, error: String(e).slice(0, 200) }, { status: 500 }); }
}
