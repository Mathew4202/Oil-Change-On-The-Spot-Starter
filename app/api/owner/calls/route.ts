// HQ: calls waiting on us. GET → list · POST {id, action: "hold"|"link"|"done", start?}
import { NextRequest, NextResponse } from "next/server";
import { currentOwner } from "@/lib/os/auth";
import { openCalls, holdFromCall, linkFromCall, doneCall, replyToText, wantedText } from "@/lib/os/calls";
import { when } from "@/lib/os/customer-texts";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  if (!currentOwner()) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const calls = await openCalls();
  return NextResponse.json({ calls: calls.map((c) => ({ id: c.id, phone: c.phone, status: c.status, at: c.started_at ?? c.created_at, summary: c.summary, extract: c.extract,
    suggested: c.suggested_start, suggestedText: c.suggested_start ? when(c.suggested_start) : null, wanted: wantedText(c.extract), customerId: c.customer_id, channel: c.channel ?? "call", texts: c.texts ?? [] })) });
}

export async function POST(req: NextRequest) {
  const owner = currentOwner();
  if (!owner) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const id = String(b.id || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  try {
    if (b.action === "hold") { const r = await holdFromCall(id, b.start ? String(b.start) : null, owner); return NextResponse.json(r, { status: r.ok ? 200 : 400 }); }
    if (b.action === "link") return NextResponse.json(await linkFromCall(id));
    if (b.action === "done") { await doneCall(id); return NextResponse.json({ ok: true }); }
    if (b.action === "reply") { const r = await replyToText(id, String(b.body || ""), owner); return NextResponse.json(r, { status: r.ok ? 200 : 400 }); }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: "Something went wrong", detail: String(e) }, { status: 500 });
  }
}
