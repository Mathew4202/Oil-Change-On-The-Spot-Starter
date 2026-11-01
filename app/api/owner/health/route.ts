// Owners: is everything connected on the live site? Quo (calls and texts), phone notifications, the evening job, email.
// GET → the checks. POST → send a test notification to this owner's phones.
import { NextResponse } from "next/server";
import { currentOwner, isOwner } from "@/lib/os/auth";
import { sbGet, enc } from "@/lib/os/db";
import { pushToOwners } from "@/lib/os/push";

export const dynamic = "force-dynamic";

export async function GET() {
  const owner = currentOwner();
  if (!owner || !isOwner()) return NextResponse.json({ error: "Owners only" }, { status: 403 });
  const [hook, call, subs, mine] = await Promise.all([
    sbGet<{ at: string; type: string }>("webhook_log?select=at,type&order=at.desc&limit=1").catch(() => []),
    sbGet<{ created_at: string; phone: string | null; state: string | null }>("calls?select=created_at,phone,state&order=created_at.desc&limit=1").catch(() => []),
    sbGet<{ owner: string; last_ok: string | null; created_at: string }>("push_subscriptions?select=owner,last_ok,created_at").catch(() => []),
    sbGet<{ device: string | null; last_ok: string | null; created_at: string }>(`push_subscriptions?select=device,last_ok,created_at&owner=eq.${enc(owner)}`).catch(() => []),
  ]);
  const email = process.env.EMAIL_FROM || "";
  return NextResponse.json({
    quo: { key: !!process.env.QUO_API_KEY, number: !!process.env.QUO_FROM_NUMBER, secret: !!process.env.QUO_WEBHOOK_SECRET,
      lastEvent: hook[0] ?? null, lastCall: call[0] ? { at: call[0].created_at, state: call[0].state } : null },
    push: { mine: mine.length, myDevices: mine.map((m) => ({ device: /iphone/i.test(m.device || "") ? "iPhone" : /android/i.test(m.device || "") ? "Android" : /mac/i.test(m.device || "") ? "Mac" : "Phone or computer", lastOk: m.last_ok, since: m.created_at })),
      everyone: Object.entries(subs.reduce((a, s) => ({ ...a, [s.owner]: (a[s.owner] ?? 0) + 1 }), {} as Record<string, number>)) },
    cron: !!process.env.CRON_SECRET,
    site: process.env.SITE_URL || null,
    email: { ready: !!process.env.RESEND_API_KEY && !/resend\.dev/i.test(email) && !!email, from: email.replace(/^.*</, "").replace(/>$/, "") || null },
    webhookUrl: `${process.env.SITE_URL || "https://oilchangeonthespot.ca"}/api/quo/webhook`,
  });
}

export async function POST() {
  const owner = currentOwner();
  if (!owner || !isOwner()) return NextResponse.json({ error: "Owners only" }, { status: 403 });
  const r = await pushToOwners({ title: "Test from HQ", body: "Notifications work on this phone.", url: "/owner", tag: "health-test" }, owner);
  return NextResponse.json(r);
}
