// Reminders for held times: someone we held a time for (on a call or by text) gets a nudge 30 minutes and 1 hour later
// if the booking link still hasn't been filled in. Run every 5 minutes by the Gmail script (POST /api/cron/tick).
import { sbGet, sbInsert, enc } from "@/lib/os/db";
import { sendSms, fill } from "@/lib/os/sms";
import { holdLink, type Hold } from "@/lib/os/holds";
import { when as whenText, timeOnly } from "@/lib/os/customer-texts";
import { halifaxDate } from "@/lib/os/slots";
import { dueNudge, serviceName, whyDetails, timeWords, NUDGE_DEFAULTS } from "@/lib/os/hold-nudge-plan";

const hourIn = (d: Date) => Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Halifax", hour: "2-digit", hourCycle: "h23" }).format(d));

/** The text for a reminder: HQ's saved wording if there is one, or the default. Switched off in HQ = null. */
async function wording(n: 1 | 2): Promise<string | null> {
  const [t] = await sbGet<{ body: string; active: boolean }>(`message_templates?select=body,active&key=eq.hold_nudge_${n}`).catch(() => []);
  if (t) return t.active ? t.body : null;
  return NUDGE_DEFAULTS[n];
}

export async function runHoldNudges(now = new Date()) {
  const since = new Date(now.getTime() - 3 * 3600000).toISOString();
  const holds = await sbGet<Hold & { created_at: string }>(
    `slot_holds?select=*&status=eq.held&booking_id=is.null&created_at=gt.${since}&expires_at=gt.${now.toISOString()}&order=created_at`).catch(() => []);
  const out: { hold: string; nudge: number; status: string }[] = [];
  for (const h of holds) {
    if (!h.phone) continue;
    const keys = [1, 2].map((n) => `hold_nudge:${h.id}:${n}`);
    const logged = await sbGet<{ type: string }>(`webhook_log?select=type&type=in.(${keys.map((k) => `"${k}"`).join(",")})`).catch(() => null);
    if (!logged) continue;   // can't check what was sent: don't risk a double text
    const sent = logged.map((l) => Number(l.type.split(":").pop()));
    const n = dueNudge(h, now, sent, hourIn(now));
    if (!n) continue;
    // they texted us back since we held it, or booked another way: a person is on it, no reminder
    const after = new Date(h.created_at).toISOString();
    const [reply] = await sbGet<{ id: string }>(`messages?select=id&direction=eq.in&from_phone=eq.${enc(h.phone)}&sent_at=gt.${after}&limit=1`).catch(() => [{ id: "?" }]);
    const [booked] = await sbGet<{ id: string }>(`bookings?select=id,customers!inner(phone)&customers.phone=eq.${enc(h.phone)}&created_at=gt.${after}&status=in.(requested,confirmed,in_progress)&limit=1`).catch(() => [{ id: "?" }]);
    if (reply || booked) {
      // count both as handled so it never fires later
      for (const k of keys) await sbInsert("webhook_log", { type: k, body: { skipped: reply ? "they replied" : "already booked" } }).catch(() => null);
      out.push({ hold: h.id, nudge: n, status: reply ? "skipped_replied" : "skipped_booked" });
      continue;
    }
    // mark first (and the earlier one too, so they never get both back to back), then send
    for (const m of [1, 2].filter((m) => m <= n && !sent.includes(m))) await sbInsert("webhook_log", { type: `hold_nudge:${h.id}:${m}`, body: { at: now.toISOString() } });
    const body = await wording(n);
    if (!body) { out.push({ hold: h.id, nudge: n, status: "off" }); continue; }
    const [c] = await sbGet<{ id: string }>(`customers?select=id&phone=eq.${enc(h.phone)}&limit=1`).catch(() => []);
    const text = fill(body, {
      first_name: h.first_name?.trim() || "there", service: serviceName(h.job), why: whyDetails(h.job), link: holdLink(h.token), until: timeOnly(h.expires_at),
      time: timeWords(halifaxDate(new Date(h.starts_at)), halifaxDate(now), timeOnly(h.starts_at), whenText(h.starts_at)),
    });
    const r = await sendSms(h.phone, text, { kind: `hold_nudge_${n}`, customerId: c?.id ?? null });
    out.push({ hold: h.id, nudge: n, status: r.status });
  }
  return out;
}
