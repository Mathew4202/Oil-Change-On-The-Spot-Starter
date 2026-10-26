// "Look up the oil now" on a job card: tries the car again (even if an earlier try found nothing) and attaches it.
import { NextRequest, NextResponse } from "next/server";
import { currentOwner } from "@/lib/os/auth";
import { attachSpec } from "@/lib/os/spec-learn";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!currentOwner()) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const { bookingId } = await req.json().catch(() => ({}));
  if (!/^[0-9a-f-]{36}$/i.test(String(bookingId || ""))) return NextResponse.json({ error: "bad id" }, { status: 400 });
  try {
    const r = await attachSpec(String(bookingId), { retry: true });
    return NextResponse.json(r.ok ? { ok: true, oil: `${r.spec.oil_grade}, ${Number(r.spec.capacity_l)} L` } : r);
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Couldn't look it up right now. Try again in a minute.", detail: String(e).slice(0, 200) });
  }
}
