// Owners: is everything connected on the live site? Quo (calls and texts), phone notifications, the evening job, email.
// GET → the checks. POST → send a test notification to this owner's phones.
import { NextResponse } from "next/server";
import { currentOwner, isOwner } from "@/lib/os/auth";
import { sbGet, enc } from "@/lib/os/db";
import { pushToOwners } from "@/lib/os/push";
import { convergeCheck } from "@/lib/os/payments";
import { segments } from "@/lib/os/text";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const owner = currentOwner();
  if (!owner || !isOwner()) return NextResponse.json({ error: "Owners only" }, { status: 403 });
  if (req.nextUrl.searchParams.get("check") === "converge") return NextResponse.json(await convergeCheck());
  const monthStart = `${new Date().toLocaleDateString("en-CA", { timeZone: "America/Halifax" }).slice(0, 7)}-01`;
  const [hook, call, subs, mine, sentTexts, lastFail] = await Promise.all([
    sbGet<{ at: string; type: string }>("webhook_log?select=at,type&order=at.desc&limit=1").catch(() => []),
    sbGet<{ created_at: string; phone: string | null; state: string | null }>("calls?select=created_at,phone,state&order=created_at.desc&limit=1").catch(() => []),
    sbGet<{ owner: string; last_ok: string | null; created_at: string }>("push_subscriptions?select=owner,last_ok,created_at").catch(() => []),
    sbGet<{ device: string | null; last_ok: string | null; created_at: string }>(`push_subscriptions?select=device,last_ok,created_at&owner=eq.${enc(owner)}`).catch(() => []),
    sbGet<{ kind: string | null; body: string | null }>(`messages?select=kind,body&channel=eq.sms&direction=eq.out&status=eq.sent&sent_at=gte.${monthStart}`).catch(() => []),
    sbGet<{ sent_at: string; error: string | null }>("messages?select=sent_at,error&channel=eq.sms&direction=eq.out&status=eq.failed&order=sent_at.desc&limit=1").catch(() => []),
  ]);
  // what the automatic texts cost this month: Quo bills $0.01 a segment
  const byKind: Record<string, { texts: number; segments: number }> = {};
  let segs = 0;
  for (const m of sentTexts) { const n = segments(m.body || ""); segs += n; const k = m.kind || "other"; byKind[k] = { texts: (byKind[k]?.texts ?? 0) + 1, segments: (byKind[k]?.segments ?? 0) + n }; }
  const top = Object.entries(byKind).sort((a, b) => b[1].segments - a[1].segments).slice(0, 4).map(([kind, v]) => ({ kind, ...v }));
  const email = process.env.EMAIL_FROM || "";
  return NextResponse.json({
    quo: { key: !!process.env.QUO_API_KEY, number: !!process.env.QUO_FROM_NUMBER, secret: !!process.env.QUO_WEBHOOK_SECRET,
      lastEvent: hook[0] ?? null, lastCall: call[0] ? { at: call[0].created_at, state: call[0].state } : null,
      usage: { texts: sentTexts.length, segments: segs, cost: Math.round(segs) / 100, top, outOfCredits: !!lastFail[0]?.error?.startsWith("402") && Date.now() - new Date(lastFail[0].sent_at).getTime() < 3 * 86400000 } },
    push: { mine: mine.length, myDevices: mine.map((m) => ({ device: /iphone/i.test(m.device || "") ? "iPhone" : /android/i.test(m.device || "") ? "Android" : /mac/i.test(m.device || "") ? "Mac" : "Phone or computer", lastOk: m.last_ok, since: m.created_at })),
      everyone: Object.entries(subs.reduce((a, s) => ({ ...a, [s.owner]: (a[s.owner] ?? 0) + 1 }), {} as Record<string, number>)) },
    cron: !!process.env.CRON_SECRET,
    site: process.env.SITE_URL || null,
    email: { ready: !!process.env.RESEND_API_KEY && !/resend\.dev/i.test(email) && !!email, from: email.replace(/^.*</, "").replace(/>$/, "") || null },
    etransfer: { secret: !!process.env.ETRANSFER_SECRET },
    card: { set: !!(process.env.CONVERGE_MERCHANT_ID && process.env.CONVERGE_USER_ID && process.env.CONVERGE_PIN), mode: (process.env.CONVERGE_ENV || "demo") === "prod" ? "prod" : "demo" },
    webhookUrl: `${process.env.SITE_URL || "https://oilchangeonthespot.ca"}/api/quo/webhook`,
  });
}

export async function POST() {
  const owner = currentOwner();
  if (!owner || !isOwner()) return NextResponse.json({ error: "Owners only" }, { status: 403 });
  const r = await pushToOwners({ title: "Test from HQ", body: "Notifications work on this phone.", url: "/owner", tag: "health-test" }, owner);
  return NextResponse.json(r);
}
