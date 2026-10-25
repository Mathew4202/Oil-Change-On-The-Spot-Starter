// Quo calls this for every text a customer sends to our number, and for calls (ended, summary ready, transcript ready).
// STOP → texts off (one confirmation). START → texts back on. "Cancel" → alert us (they probably mean the booking).
import { NextRequest, NextResponse } from "next/server";
import { sbGet, sbInsert, sbPatch, enc } from "@/lib/os/db";
import { e164 } from "@/lib/os/booking";
import { sendSms } from "@/lib/os/sms";
import { pushToOwners } from "@/lib/os/push";
import { parseQuoEvent, intentOf, verifyQuo } from "@/lib/os/inbound-sms";
import { parseCallEvent } from "@/lib/os/call-events";
import { handleCallEvent, handleTextIn } from "@/lib/os/calls";
import { agreeByText } from "@/lib/os/plans";

export const dynamic = "force-dynamic";

const STOP_REPLY = "You won't get any more texts from Oil Change On The Spot. Reply START to turn them back on. - Mathew";
const START_REPLY = "Texts from Oil Change On The Spot are back on. Reply STOP anytime to turn them off. - Mathew";

async function alertOwners(title: string, body: string, url: string, tag: string) {
  try { await sbInsert("notifications", { kind: "text_reply", title, body }); } catch { /* best effort */ }
  await Promise.race([pushToOwners({ title, body, url, tag }).catch(() => null), new Promise((r) => setTimeout(r, 4000))]);
}

export async function POST(req: NextRequest) {
  const raw = Buffer.from(await req.arrayBuffer());
  const ok = verifyQuo(raw, {
    id: req.headers.get("webhook-id"), timestamp: req.headers.get("webhook-timestamp"), signature: req.headers.get("webhook-signature"),
    legacy: req.headers.get("openphone-signature"),
  }, process.env.QUO_WEBHOOK_SECRET || "");
  if (!ok) return NextResponse.json({ error: "bad signature" }, { status: 401 });

  let json: unknown; try { json = JSON.parse(raw.toString("utf8")); } catch { return NextResponse.json({ ok: true, ignored: "not json" }); }
  // keep what Quo sent for two weeks, so any problem can be traced (migration 0028)
  await sbInsert("webhook_log", { type: String((json as { type?: string })?.type ?? ""), body: json }).catch(() => null);
  // Calls: save them and work out what the caller wants (one-tap hold + link in HQ)
  const call = parseCallEvent(json);
  if (call) return NextResponse.json(await handleCallEvent(call).catch((e) => ({ error: String(e).slice(0, 200) })));

  const m = parseQuoEvent(json);
  if (!m) return NextResponse.json({ ok: true, ignored: "not an incoming text" });
  const from = e164(m.from);

  // Quo retries until we answer 200, so the same text can arrive twice: only act on it once
  const logged = await sbInsert("messages", { channel: "sms", direction: "in", kind: "reply", body: m.text.slice(0, 2000), status: "received",
    from_phone: from, provider_id: m.messageId ?? m.eventId });
  if (!logged.ok && logged.status === 409) return NextResponse.json({ ok: true, duplicate: true });

  const [c] = await sbGet<{ id: string; first_name: string | null; last_name: string | null; sms_opt_out: boolean }>(
    `customers?select=id,first_name,last_name,sms_opt_out&phone=eq.${enc(from)}&limit=1`);
  if (c && logged.ok && (logged.data as { id?: string })?.id) await sbPatch("messages", `id=eq.${(logged.data as { id: string }).id}`, { customer_id: c.id });
  const name = c ? [c.first_name, c.last_name].filter(Boolean).join(" ") || from : from;
  const page = c ? `/owner/customers/${c.id}` : "/owner/customers";
  // I AGREE to a maintenance plan offer: the plan starts and the first pay link goes out
  const agreed = await agreeByText(from, m.text).catch(() => null);
  if (agreed) return NextResponse.json({ ok: true, action: "plan_started" });

  const intent = intentOf(m.text);

  if (intent === "stop") {
    if (c) await sbPatch("customers", `phone=eq.${enc(from)}`, { sms_opt_out: true, sms_opt_out_at: new Date().toISOString(), sms_opt_out_by: "reply" });
    else await sbInsert("customers", { phone: from, sms_opt_out: true, sms_opt_out_at: new Date().toISOString(), sms_opt_out_by: "reply", source: "text_reply", notes: "Texted STOP before we had them on file" });
    if (!c?.sms_opt_out) await sendSms(from, STOP_REPLY, { kind: "stop_confirm", customerId: c?.id ?? null, force: true });
    await alertOwners(`${name} turned off texts`, "They replied STOP. HQ won't send them any more automatic texts.", page, `stop-${from}`);
    return NextResponse.json({ ok: true, action: "texts_off" });
  }
  if (intent === "start" && c?.sms_opt_out) {
    await sbPatch("customers", `phone=eq.${enc(from)}`, { sms_opt_out: false, sms_opt_out_at: null, sms_opt_out_by: null });
    await sendSms(from, START_REPLY, { kind: "start_confirm", customerId: c.id, force: true });
    await alertOwners(`${name} turned texts back on`, "They replied START.", page, `start-${from}`);
    return NextResponse.json({ ok: true, action: "texts_on" });
  }
  if (intent === "cancel") {
    await alertOwners(`${name} texted "${m.text.trim().slice(0, 40)}"`, "Sounds like they want to cancel a booking. Their texts are still on. Reply from HQ or Quo.", page, `cancel-${from}`);
  }
  // Every other text lands in HQ next to the calls: read for what they want, one tap to hold a time, or reply right there
  const r = await handleTextIn({ phone: from, text: m.text, messageId: m.messageId ?? m.eventId }).catch((e) => ({ error: String(e).slice(0, 200) }));
  return NextResponse.json({ ok: true, action: intent === "cancel" ? "alerted" : "to_hq", ...r });
}
