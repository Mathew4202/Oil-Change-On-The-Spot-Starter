// Full import: Square customers + every appointment since launch -> HQ. Visit /api/admin/import-square?key=ADMIN_SECRET.
// Safe to run more than once (matched on Square IDs). The evening job and the owners' button do the recent part.
import { NextRequest, NextResponse } from "next/server";
import { syncSquare } from "@/lib/os/square-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!process.env.ADMIN_SECRET || req.nextUrl.searchParams.get("key") !== process.env.ADMIN_SECRET) return NextResponse.json({ error: "not allowed" }, { status: 401 });
  try {
    return NextResponse.json(await syncSquare(new Date("2025-07-01T00:00:00Z"), new Date(Date.now() + 90 * 86400000)));
  } catch (e) { return NextResponse.json({ ok: false, error: String(e) }, { status: 500 }); }
}
