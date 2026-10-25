// HQ: load (or refresh) every car's engine sizes from the free EPA list. POST → { ok, rows }
import { NextResponse } from "next/server";
import { currentOwner } from "@/lib/os/auth";
import { importEpaEngines } from "@/lib/os/epa-import";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST() {
  if (!currentOwner()) return NextResponse.json({ ok: false, error: "Please sign in" }, { status: 401 });
  const r = await importEpaEngines().catch((e) => ({ ok: false, error: String(e).slice(0, 200) }));
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
