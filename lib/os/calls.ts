// Calls from Quo turned into one-tap actions: read what the caller wants from Quo's summary / transcript,
// find the open time that matches, and let an owner hold it + text the link with a single tap.
import { sbGet, sbInsert, sbPatch, sbPatchRows, enc } from "@/lib/os/db";
import { pushToOwners } from "@/lib/os/push";
import { dayAvailability, jobMinutes } from "@/lib/os/calendar";
import { halifaxDate } from "@/lib/os/slots";
import { siteUrl, when as whenText } from "@/lib/os/customer-texts";
import { sendSms, template, fill } from "@/lib/os/sms";
import { createHold } from "@/lib/os/holds";
import { pickSlot, type CallEvent } from "@/lib/os/call-events";

export type Extract = { name: string | null; year: number | null; make: string | null; model: string | null; engine: string | null;
  job: "oil_change" | "seasonal" | "tires" | "rotation" | "parts" | "diagnostic" | null; cars: number;
  date: string | null; time: string | null; part: "morning" | "afternoon" | "evening" | null; wantsBooking: boolean; notes: string | null };

export type CallRow = { id: string; provider_id: string; phone: string | null; direction: string | null; status: string | null; duration: number | null; started_at: string | null;
  summary: string[] | null; next_steps: string[] | null; transcript: string | null; extract: Extract | null; suggested_start: string | null; customer_id: string | null;
  hold_id: string | null; state: string; created_at: string };
const COLS = "id,provider_id,phone,direction,status,duration,started_at,summary,next_steps,transcript,extract,suggested_start,customer_id,hold_id,state,created_at";
const e164 = (p: string) => { const d = p.replace(/\D/g, ""); return d.length === 10 ? `+1${d}` : `+${d}`; };

/** Save what Quo sent about a call; once we know what they said, work out what they want and tell the owners. */
export async function handleCallEvent(ev: CallEvent) {
  if (ev.direction && ev.direction !== "incoming") return { ignored: "outgoing call" };
  const [existing] = await sbGet<CallRow>(`calls?select=${COLS}&provider_id=eq.${enc(ev.callId)}`);
  const phone = ev.phone ? e164(ev.phone) : existing?.phone ?? null;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), ...(phone ? { phone } : {}) };
  if (ev.direction) patch.direction = ev.direction;
  if (ev.status) patch.status = ev.status;
  if (ev.duration != null) patch.duration = ev.duration;
  if (ev.startedAt) patch.started_at = ev.startedAt;
  if (ev.summary) patch.summary = ev.summary;
  if (ev.nextSteps) patch.next_steps = ev.nextSteps;
  if (ev.transcript) patch.transcript = ev.transcript.slice(0, 20000);
  if (phone && !existing?.customer_id) {
    const [c] = await sbGet<{ id: string }>(`customers?select=id&phone=eq.${enc(phone)}`);
    if (c) patch.customer_id = c.id;
  }
  let row: CallRow | undefined;
  if (existing) [row] = await sbPatchRows<CallRow>("calls", `id=eq.${existing.id}`, patch);
  else { const r = await sbInsert<CallRow>("calls", { provider_id: ev.callId, ...patch }); row = r.data; if (!r.ok && r.status === 409) [row] = await sbGet<CallRow>(`calls?select=${COLS}&provider_id=eq.${enc(ev.callId)}`); }
  if (!row) return { error: "couldn't save the call" };

  // Missed call: tell the owners right away (one tap texts them the booking link)
  if (ev.kind === "completed" && (ev.status === "unanswered" || ev.status === "abandoned") && !existing) {
    await alert(row, `Missed call from ${await who(row)}`, "Tap to text them the booking link.");
    return { ok: true, action: "missed" };
  }
  // We have words: read them once
  const text = [...(row.summary ?? []), ...(row.next_steps ?? []).map((s) => `Next step: ${s}`), ...Object.entries(ev.aiFields).map(([k, v]) => `${k}: ${v}`), row.transcript ?? ""].join("\n").trim();
  if ((ev.kind === "summary" || ev.kind === "transcript") && text && !row.extract) {
    const x = await readCall(text);
    if (x) {
      const suggested = x.wantsBooking ? await suggestStart(x) : null;
      [row] = await sbPatchRows<CallRow>("calls", `id=eq.${row.id}`, { extract: x, suggested_start: suggested });
      if (row && x.wantsBooking) {
        const car = [x.year, x.make, x.model].filter(Boolean).join(" ");
        const what = [x.job ? JOB_NAME[x.job] : null, car || null, x.cars > 1 ? `${x.cars} cars` : null].filter(Boolean).join(", ");
        await alert(row, `${x.name || (await who(row))} wants ${what || "to book"}`,
          suggested ? `Tap to hold ${whenText(suggested)} and text them the link.` : "Tap to pick a time to hold and text them the link.");
      }
    }
  }
  return { ok: true };
}

const JOB_NAME: Record<string, string> = { oil_change: "an oil change", seasonal: "the seasonal package", tires: "a tire change", rotation: "a tire rotation", parts: "a parts visit", diagnostic: "a diagnostic" };

async function who(row: CallRow) {
  if (row.customer_id) { const [c] = await sbGet<{ first_name: string | null; last_name: string | null }>(`customers?select=first_name,last_name&id=eq.${row.customer_id}`); const n = [c?.first_name, c?.last_name].filter(Boolean).join(" "); if (n) return n; }
  return row.phone?.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3") ?? "an unknown number";
}

async function alert(row: CallRow, title: string, body: string) {
  try { await sbInsert("notifications", { kind: "call", title, body }); } catch { /* best effort */ }
  await Promise.race([pushToOwners({ title, body, url: `/owner?call=${row.id}`, tag: `call-${row.id}` }).catch(() => null), new Promise((r) => setTimeout(r, 4000))]);
}

const PROMPT = (today: string, text: string) => `Today is ${today} (Halifax, Nova Scotia). This is what a caller said to Oil Change On The Spot, a mobile oil change business (summary and/or transcript):
---
${text.slice(0, 12000)}
---
Reply with ONLY this JSON:
{"name":"caller's first name or null","year":2019,"make":"Honda","model":"Civic","engine":"2.0L or null","job":"oil_change|seasonal|tires|rotation|parts|diagnostic|null",
 "cars":1,"date":"YYYY-MM-DD they want, or null","time":"HH:MM 24h if they named a time, or null","part":"morning|afternoon|evening|null",
 "wantsBooking":true,"notes":"anything useful in one short line (address area, extra work, problem), or null"}
Rules: "tires" = swapping tires already on rims. Work out real dates from words like "Wednesday" or "tomorrow" (the next one after today). If they did not want to book anything (wrong number, spam, a supplier), wantsBooking is false. Use null for anything not said.`;

/** Ask Claude to read the call (same key as the receipt reader). */
export async function readCall(text: string): Promise<Extract | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !text.trim()) return null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Halifax", weekday: "long", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const res = await fetch(`${process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com"}/v1/messages`, {
    method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", max_tokens: 400, messages: [{ role: "user", content: PROMPT(today, text) }] }),
  }).catch(() => null);
  if (!res?.ok) return null;
  const body = await res.json().catch(() => ({}));
  const out = (body.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
  try { return cleanExtract(JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1))); } catch { return null; }
}

const JOBS = ["oil_change", "seasonal", "tires", "rotation", "parts", "diagnostic"];
export function cleanExtract(o: Record<string, unknown>): Extract {
  const s = (v: unknown, n = 60) => (typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "null" ? v.trim().slice(0, n) : null);
  const y = Number(o.year);
  return {
    name: s(o.name, 40), year: y >= 1980 && y <= 2030 ? y : null, make: s(o.make, 40), model: s(o.model), engine: s(o.engine, 40),
    job: JOBS.includes(String(o.job)) ? (o.job as Extract["job"]) : null, cars: Math.min(4, Math.max(1, Math.round(Number(o.cars) || 1))),
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(o.date)) ? String(o.date) : null, time: /^\d{1,2}:\d{2}$/.test(String(o.time)) ? String(o.time) : null,
    part: ["morning", "afternoon", "evening"].includes(String(o.part)) ? (o.part as Extract["part"]) : null,
    wantsBooking: o.wantsBooking !== false, notes: s(o.notes, 200),
  };
}

/** The open time that matches what they asked for: their day (or the next 7 days if they only said "afternoon"). */
export async function suggestStart(x: Extract): Promise<string | null> {
  const rules = Object.fromEntries((await sbGet<{ key: string; value: number }>("pricing_rules?select=key,value")).map((r) => [r.key, Number(r.value)]));
  const minutes = jobMinutes(x.job ?? "oil_change", rules, []) * x.cars;
  const today = halifaxDate(new Date());
  const days = x.date ? [x.date] : Array.from({ length: 7 }, (_, i) => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); });
  for (const d of days) {
    if (d < today) continue;
    const day = await dayAvailability(d, { cars: 1, minutes, filterInStock: true }).catch(() => null);
    const hit = day ? pickSlot(day.slots, { time: x.time, part: x.part }) : null;
    if (hit) return hit.start;
  }
  return null;
}

/** Calls still waiting for something from us (last 3 days). */
export async function openCalls(): Promise<CallRow[]> {
  try {
    return await sbGet<CallRow>(`calls?select=${COLS}&state=eq.open&created_at=gte.${new Date(Date.now() - 3 * 86400000).toISOString()}&order=created_at.desc&limit=20`);
  } catch { return []; }   // migration 0024 not run yet
}

/** One tap: hold the suggested (or picked) time and text them the link. */
export async function holdFromCall(id: string, startIso: string | null, owner: string) {
  const [c] = await sbGet<CallRow>(`calls?select=${COLS}&id=eq.${enc(id)}`);
  if (!c || !c.phone) return { ok: false as const, error: "No number for this call" };
  const start = startIso || c.suggested_start;
  if (!start) return { ok: false as const, error: "Pick a time to hold" };
  const x = c.extract;
  const r = await createHold({ start, firstName: x?.name ?? "", phone: c.phone, job: x?.job ?? "oil_change", cars: x?.cars ?? 1, hours: 2,
    note: [x ? [x.year, x.make, x.model].filter(Boolean).join(" ") : "", x?.notes ?? ""].filter(Boolean).join(" · ") }, owner);
  if (!r.ok) return r;
  await sbPatch("slot_holds", `id=eq.${r.hold.id}`, { call_id: c.id, car_year: x?.year ?? null, car_make: x?.make ?? null, car_model: x?.model ?? null }).catch(() => null);
  await sbPatch("calls", `id=eq.${c.id}`, { state: "held", hold_id: r.hold.id });
  return r;
}

/** One tap: no time agreed, just text them the booking link (with their car filled in if we heard it). */
export async function linkFromCall(id: string) {
  const [c] = await sbGet<CallRow>(`calls?select=${COLS}&id=eq.${enc(id)}`);
  if (!c || !c.phone) return { ok: false as const, error: "No number for this call" };
  const x = c.extract;
  const q = new URLSearchParams();
  if (x?.year && x.make) { q.set("year", String(x.year)); q.set("make", x.make); if (x.model) q.set("model", x.model); }
  if (x?.job) q.set("job", x.job);
  const link = `${siteUrl()}/booking${q.toString() ? `?${q}` : ""}`;
  const body = await template("book_link");
  const sms = body ? await sendSms(c.phone, fill(body, { first_name: x?.name || "there", link }), { kind: "book_link", customerId: c.customer_id }) : { sent: false, status: "template_off" };
  await sbPatch("calls", `id=eq.${c.id}`, { state: "linked" });
  return { ok: true as const, sms, link };
}

export const doneCall = (id: string) => sbPatch("calls", `id=eq.${enc(id)}`, { state: "done" });
