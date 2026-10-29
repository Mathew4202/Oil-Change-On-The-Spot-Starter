import crypto from "crypto";
// Calls from Quo turned into one-tap actions: read what the caller wants from Quo's summary / transcript,
// find the open time that matches, and let an owner hold it + text the link with a single tap.
import { sbGet, sbInsert, sbPatch, sbPatchRows, enc } from "@/lib/os/db";
import { pushToOwners } from "@/lib/os/push";
import { dayAvailability, jobMinutes } from "@/lib/os/calendar";
import { halifaxDate } from "@/lib/os/slots";
import { siteUrl, when as whenText } from "@/lib/os/customer-texts";
import { sendSms, template, fill } from "@/lib/os/sms";
import { createHold } from "@/lib/os/holds";
import { pickSlot, basicExtract, type CallEvent } from "@/lib/os/call-events";
import { MAKES } from "@/data/makes";
import { askAI } from "@/lib/os/ai";

export type Extract = { name: string | null; lastName?: string | null; address?: string | null; email?: string | null; addons?: string[]; problem?: string | null; year: number | null; make: string | null; model: string | null; engine: string | null;
  job: "oil_change" | "seasonal" | "tires" | "rotation" | "parts" | "diagnostic" | null; cars: number;
  date: string | null; time: string | null; part: "morning" | "afternoon" | "evening" | null; wantsBooking: boolean; notes: string | null };

export type CallRow = { id: string; provider_id: string; phone: string | null; direction: string | null; status: string | null; duration: number | null; started_at: string | null;
  summary: string[] | null; next_steps: string[] | null; transcript: string | null; extract: Extract | null; suggested_start: string | null; customer_id: string | null;
  hold_id: string | null; state: string; created_at: string; channel?: string; texts?: TextLine[] };
export type TextLine = { at: string; from: "them" | "us"; body: string; by?: string | null };
const COLS = "id,provider_id,phone,direction,status,duration,started_at,summary,next_steps,transcript,extract,suggested_start,customer_id,hold_id,state,created_at";
const COLS_TEXT = `${COLS},channel,texts`;   // migration 0028
async function rows(q: string) { return sbGet<CallRow>(`calls?select=${COLS_TEXT}&${q}`).catch(() => sbGet<CallRow>(`calls?select=${COLS}&${q}`)); }
const e164 = (p: string) => { const d = p.replace(/\D/g, ""); return d.length === 10 ? `+1${d}` : `+${d}`; };

/** Save what Quo sent about a call; once we know what they said, work out what they want and tell the owners. */
export async function handleCallEvent(ev: CallEvent) {
  if (ev.direction && ev.direction !== "incoming") return { ignored: "outgoing call" };
  let [existing] = await sbGet<CallRow>(`calls?select=${COLS}&provider_id=eq.${enc(ev.callId)}`);
  // a summary or transcript we can't tie to a call or a number: it belongs to the latest call still waiting for one
  if (!existing && !ev.phone && ev.kind !== "completed") {
    [existing] = await sbGet<CallRow>(`calls?select=${COLS}&summary=is.null&transcript=is.null&created_at=gte.${new Date(Date.now() - 30 * 60000).toISOString()}&order=created_at.desc&limit=1`).catch(() => []);
  }
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
          suggested ? `Tap to hold ${whenText(suggested)} and text them the link.` : wantedText(x) ? `${wantedText(x)} is taken. Tap to text them the booking link.` : "Tap to text them the booking link with their details filled in.");
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
{"name":"caller's first name or null","lastName":"last name or null","address":"street address where the car will be, with town, or null","email":"email or null","year":2019,"make":"Honda","model":"Civic","engine":"2.0L or null","job":"oil_change|seasonal|tires|rotation|parts|diagnostic|null",
 "cars":1,"date":"YYYY-MM-DD they want, or null","time":"HH:MM 24h if they named a time, or null","part":"morning|afternoon|evening|null",
 "addons":["any of: wipers, cabin_filter, engine_filter, battery, coolant, washer_fluid, tires"],"problem":"for a diagnostic: what's wrong with the car, or null",
 "wantsBooking":true,"notes":"anything else useful in one short line (gate code, parking), or null"}
Rules: "tires" = swapping tires already on rims. Work out real dates from words like "Wednesday" or "tomorrow" (the next one after today). If they did not want to book anything (wrong number, spam, a supplier), wantsBooking is false. Use null for anything not said.`;

/** Ask Claude to read the call (same key as the receipt reader). */
export async function readCall(text: string): Promise<Extract | null> {
  if (!text.trim()) return null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Halifax", weekday: "long", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  // phone numbers never leave the app (free AI tiers may keep what they're sent)
  const clean = text.replace(/\+?1?[\s.(-]*\d{3}[\s.)-]*\d{3}[\s.-]*\d{4}/g, "[number]");
  const a = await askAI({ prompt: PROMPT(today, clean), maxTokens: 400 }).catch(() => null);
  if (a) {
    const out = a.text;
    try { return cleanExtract(JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1))); } catch { /* fall through to the rules */ }
  }
  // no AI (not set up, or today's free limit used): plain rules still get the car, service and day
  const b = basicExtract(text, MAKES, halifaxDate(new Date()));
  return b ? cleanExtract(b) : null;
}

const JOBS = ["oil_change", "seasonal", "tires", "rotation", "parts", "diagnostic"];
const ADDONS = ["wipers", "cabin_filter", "engine_filter", "battery", "coolant", "washer_fluid", "tires"];
export function cleanExtract(o: Record<string, unknown>): Extract {
  const s = (v: unknown, n = 60) => (typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "null" ? v.trim().slice(0, n) : null);
  const y = Number(o.year);
  return {
    name: s(o.name, 40), lastName: s(o.lastName, 40), address: s(o.address, 160), email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(o.email ?? "")) ? String(o.email).trim().slice(0, 120) : null,
    addons: Array.isArray(o.addons) ? (o.addons as unknown[]).map(String).filter((a) => ADDONS.includes(a)) : [], problem: s(o.problem, 300), year: y >= 1980 && y <= 2030 ? y : null, make: s(o.make, 40), model: s(o.model), engine: s(o.engine, 40),
    job: JOBS.includes(String(o.job)) ? (o.job as Extract["job"]) : null, cars: Math.min(4, Math.max(1, Math.round(Number(o.cars) || 1))),
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(o.date)) ? String(o.date) : null, time: /^\d{1,2}:\d{2}$/.test(String(o.time)) ? String(o.time) : null,
    part: ["morning", "afternoon", "evening"].includes(String(o.part)) ? (o.part as Extract["part"]) : null,
    wantsBooking: o.wantsBooking !== false, notes: s(o.notes, 200),
  };
}

/** Hold only what they asked for: a day AND a time, and only if that exact time is open.
 *  Anything vaguer ("next week", "Thursday afternoon") gets the booking link with their details filled in instead. */
export async function suggestStart(x: Extract): Promise<string | null> {
  if (!x.date || !x.time || x.date < halifaxDate(new Date())) return null;
  const rules = Object.fromEntries((await sbGet<{ key: string; value: number }>("pricing_rules?select=key,value")).map((r) => [r.key, Number(r.value)]));
  const minutes = jobMinutes(x.job ?? "oil_change", rules, []) * x.cars;
  const day = await dayAvailability(x.date, { cars: 1, minutes, filterInStock: true }).catch(() => null);
  return day ? pickSlot(day.slots, { time: x.time })?.start ?? null : null;
}

/** "Wed Oct 28 at 3:00 pm" from what they asked for (null if they didn't name a day and time). */
export function wantedText(x: Extract | null) {
  if (!x?.date || !x.time) return null;
  const [h, m] = x.time.split(":").map(Number);
  const d = new Date(`${x.date}T12:00:00Z`).toLocaleDateString("en-CA", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
  return `${d} at ${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`;
}

/** Calls still waiting for something from us (last 3 days). */
export async function openCalls(): Promise<CallRow[]> {
  try {
    return await rows(`state=eq.open&updated_at=gte.${new Date(Date.now() - 3 * 86400000).toISOString()}&order=updated_at.desc&limit=25`);
  } catch { return []; }   // migration 0024 not run yet
}

/** A customer texted our number: it lands in HQ next to the calls, read the same way (car, service, when),
 *  so holding a time and texting the link is still one tap. Texts from the same number within 2 days stay together. */
export async function handleTextIn(input: { phone: string; text: string; messageId: string | null; at?: string }) {
  const phone = e164(input.phone);
  const line: TextLine = { at: input.at || new Date().toISOString(), from: "them", body: input.text.slice(0, 1600) };
  let [row] = await rows(`channel=eq.text&phone=eq.${enc(phone)}&state=eq.open&created_at=gte.${new Date(Date.now() - 2 * 86400000).toISOString()}&order=created_at.desc&limit=1`).catch(() => []);
  const [c] = await sbGet<{ id: string; first_name: string | null }>(`customers?select=id,first_name&phone=eq.${enc(phone)}`);
  if (row) {
    [row] = await sbPatchRows<CallRow>("calls", `id=eq.${row.id}`, { texts: [...(row.texts ?? []), line], updated_at: new Date().toISOString() });
  } else {
    const r = await sbInsert<CallRow>("calls", { provider_id: `sms:${input.messageId || crypto.randomUUID()}`, channel: "text", phone, direction: "incoming", status: "text",
      started_at: line.at, texts: [line], customer_id: c?.id ?? null });
    if (!r.ok) return { error: "couldn't save the text (run migration 0028)" };
    row = r.data!;
  }
  // read everything they've texted so far
  const said = (row.texts ?? []).filter((t) => t.from === "them").map((t) => `Customer texted: ${t.body}`).join("\n");
  const x = await readCall(said).catch(() => null);
  let suggested: string | null = null;
  if (x) {
    suggested = x.wantsBooking ? await suggestStart(x).catch(() => null) : null;
    await sbPatch("calls", `id=eq.${row.id}`, { extract: x, suggested_start: suggested });
  }
  const who = x?.name || c?.first_name || phone.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3");
  await alert(row, `Text from ${who}`, input.text.slice(0, 140) + (suggested ? ` · Tap to hold ${whenText(suggested)}` : ""));
  return { ok: true, id: row.id };
}

/** Reply from HQ: goes out from the business number and shows in the thread. */
export async function replyToText(id: string, body: string, owner: string) {
  const [row] = await rows(`id=eq.${enc(id)}`);
  if (!row?.phone) return { ok: false as const, error: "No number to reply to" };
  const text = body.trim().slice(0, 1000);
  if (!text) return { ok: false as const, error: "Type a message" };
  const sms = await sendSms(row.phone, text, { kind: "reply", customerId: row.customer_id });
  if (!sms.sent) return { ok: false as const, error: sms.error || "The text didn't go out" };
  await sbPatch("calls", `id=eq.${row.id}`, { texts: [...(row.texts ?? []), { at: new Date().toISOString(), from: "us", body: text, by: owner }], updated_at: new Date().toISOString() });
  return { ok: true as const };
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
  // everything they told us is filled in, so they only pick a time (and check the rest)
  const q = new URLSearchParams();
  if (x?.year && x.make) { q.set("year", String(x.year)); q.set("make", x.make); if (x.model) q.set("model", x.model); }
  if (x?.engine) q.set("engine", x.engine);
  if (x?.job) q.set("job", x.job);
  if (x?.cars && x.cars > 1) q.set("cars", String(x.cars));
  if (x?.date && x.date >= halifaxDate(new Date())) q.set("date", x.date);
  if (x?.name) q.set("name", [x.name, x.lastName].filter(Boolean).join(" "));
  if (x?.address) q.set("address", x.address);
  if (x?.email) q.set("email", x.email);
  if (x?.addons?.length) q.set("addons", x.addons.join(","));
  if (x?.problem) q.set("problem", x.problem);
  if (x?.notes) q.set("notes", x.notes);
  q.set("phone", c.phone.replace(/^\+1/, ""));
  const link = `${siteUrl()}/booking${q.toString() ? `?${q}` : ""}`;
  const [t] = await rows(`id=eq.${c.id}`);
  const isText = t?.channel === "text";
  const body = (isText ? await template("book_link_text") : null) || await template("book_link");
  const msg = body ? fill(body, { first_name: x?.name || "there", link }) : "";
  const sms = body ? await sendSms(c.phone, msg, { kind: "book_link", customerId: c.customer_id }) : { sent: false, status: "template_off" };
  await sbPatch("calls", `id=eq.${c.id}`, { state: "linked", ...(isText && sms.sent ? { texts: [...(t?.texts ?? []), { at: new Date().toISOString(), from: "us", body: msg }] } : {}) });
  return { ok: true as const, sms, link };
}

export const doneCall = (id: string) => sbPatch("calls", `id=eq.${enc(id)}`, { state: "done" });
