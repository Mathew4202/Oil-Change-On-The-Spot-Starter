// HQ: hold a time for a caller and text them the link · POST {action: "create"|"release"|"resend", ...}
import { NextRequest, NextResponse } from "next/server";
import { currentOwner } from "@/lib/os/auth";
import { createHold, releaseHold, textHold, holdLink } from "@/lib/os/holds";
import { sbGet, enc } from "@/lib/os/db";
import type { Hold } from "@/lib/os/holds";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const owner = currentOwner();
  if (!owner) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "create") {
      const r = await createHold({ start: String(b.start || ""), firstName: String(b.firstName || ""), phone: String(b.phone || ""), job: String(b.job || ""),
        cars: Number(b.cars) || 1, hours: Number(b.hours) || 2, note: String(b.note || "") }, owner);
      return NextResponse.json(r, { status: r.ok ? 200 : 400 });
    }
    const id = String(b.id || "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
    if (b.action === "release") { await releaseHold(id); return NextResponse.json({ ok: true }); }
    if (b.action === "resend") {
      const [h] = await sbGet<Hold>(`slot_holds?select=*&id=eq.${enc(id)}`);
      if (!h) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true, sms: await textHold(h), link: holdLink(h.token) });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: "Something went wrong", detail: String(e) }, { status: 500 });
  }
}
