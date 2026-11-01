// POST → email a backup of everything to the business inbox now (owners only: not listed in roles.ts, so owners only).
import { NextResponse } from "next/server";
import { isOwner } from "@/lib/os/auth";
import { backupNow } from "@/lib/os/backup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  if (!isOwner()) return NextResponse.json({ error: "Owners only" }, { status: 403 });
  const r = await backupNow();
  return NextResponse.json(r, { status: r.sent ? 200 : 500 });
}
