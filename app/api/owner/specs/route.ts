// HQ: how many of the cars we've done still need their oil approval looked up, and a button to fill a batch.
import { NextResponse } from "next/server";
import { currentOwner } from "@/lib/os/auth";
import { backfillSpecs, specsLeft } from "@/lib/os/spec-backfill";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  if (!currentOwner()) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  return NextResponse.json(await specsLeft().catch(() => ({ total: 0, left: 0 })));
}

export async function POST() {
  if (!currentOwner()) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  return NextResponse.json(await backfillSpecs(6));
}
