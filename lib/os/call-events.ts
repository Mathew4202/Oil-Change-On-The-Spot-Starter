// Quo call webhooks → plain data (no database, so tests can run it). Handles the current and older payload shapes.

export type CallEvent = {
  kind: "completed" | "summary" | "transcript";
  callId: string; phone: string | null; direction: string | null; status: string | null; duration: number | null; startedAt: string | null;
  summary: string[] | null; nextSteps: string[] | null; transcript: string | null; aiFields: Record<string, string>;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export function parseCallEvent(raw: unknown): CallEvent | null {
  const e = (raw ?? {}) as Record<string, any>;
  const kind = e.type === "call.completed" ? "completed" : e.type === "call.summary.completed" ? "summary" : e.type === "call.transcript.completed" ? "transcript" : null;
  if (!kind) return null;
  const d = e.data ?? {};
  const r = d.resource ?? d.object ?? {};
  const c = d.context ?? {};
  const callId = String(r.callId ?? r.id ?? "");
  if (!callId) return null;
  // the caller's number: participants (a string or an object), the summary's fromPhoneNumber, or the transcript's outside speaker
  const asNum = (x: any) => (x == null ? null : typeof x === "string" ? x : x.phoneNumber ?? x.identifier ?? x.number ?? x.value ?? null);
  const fromDialogue = Array.isArray(r.dialogue) ? r.dialogue.find((x: any) => !x.userId && x.identifier)?.identifier : null;
  const ext = asNum(c.participants?.external?.[0]) ?? r.fromPhoneNumber ?? fromDialogue ?? (r.direction === "incoming" ? r.from : Array.isArray(r.to) ? r.to[0] : r.to) ?? r.from ?? null;
  const done = (r.processingStatus ?? r.status) === "completed" || kind === "completed";
  const fields: Record<string, string> = {};
  for (const job of r.jobs ?? []) for (const f of job?.result?.data ?? []) if (f?.name && f?.value != null) fields[String(f.name)] = String(f.value);
  const dialogue = Array.isArray(r.dialogue) ? r.dialogue.map((x: any) => `${x.userId ? "Us" : "Caller"}: ${String(x.content ?? "").trim()}`).filter((x: string) => x.length > 7).join("\n") : null;
  return {
    kind, callId, phone: ext ? String(ext) : null, direction: r.direction ?? null,
    status: kind === "completed" ? r.status ?? null : r.handledByAiAgent ? "ai-handled" : null,
    duration: typeof r.duration === "number" ? r.duration : null, startedAt: r.createdAt ?? r.answeredAt ?? null,
    summary: kind === "summary" && done && Array.isArray(r.summary) ? r.summary.map(String) : null,
    nextSteps: kind === "summary" && done && Array.isArray(r.nextSteps) ? r.nextSteps.map(String) : null,
    transcript: kind === "transcript" && done ? dialogue : null, aiFields: fields,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export type Want = { date?: string | null; time?: string | null; part?: "morning" | "afternoon" | "evening" | null };

/** The open slot at the time the caller asked for (within 15 minutes: "3:15" can be the 3:00 slot). No time asked → null,
 *  so we text them the booking link to pick one instead of guessing. Slots are for one day, start times in Halifax "HH:MM". */
export function pickSlot<T extends { time: string }>(slots: T[], want: Want): T | null {
  if (!slots.length || !want.time || !/^\d{1,2}:\d{2}$/.test(want.time)) return null;
  const min = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const target = min(want.time);
  const best = [...slots].sort((a, b) => Math.abs(min(a.time) - target) - Math.abs(min(b.time) - target))[0];
  return Math.abs(min(best.time) - target) <= 15 ? best : null;
}

/** No-AI backup: pull the car, service and day out of a call summary or text with plain rules.
 *  Used when the free AI isn't available, so a call or text still comes with its details. todayIso = Halifax "YYYY-MM-DD". */
export function basicExtract(text: string, makes: string[], todayIso: string) {
  const t = ` ${text.replace(/\s+/g, " ")} `;
  const low = t.toLowerCase();
  const year = Number(t.match(/\b(19[89]\d|20[0-3]\d)\b/)?.[1]) || null;
  const alias: Record<string, string> = { chevy: "Chevrolet", vw: "Volkswagen", mercedes: "Mercedes-Benz", benz: "Mercedes-Benz" };
  let make: string | null = null, at = -1;
  for (const m of [...makes, ...Object.keys(alias)]) {
    const i = low.search(new RegExp(`\\b${m.toLowerCase().replace(/[-\s]/g, "[-\\s]?")}\\b`));
    if (i >= 0 && (at < 0 || i < at)) { make = alias[m] ?? m; at = i; }
  }
  // the word or two after the make, up to a stop word ("2019 Honda Civic for Thursday" -> Civic)
  let model: string | null = null;
  if (make && at >= 0) {
    const after = t.slice(at).replace(/^\s*\S+(\s+(benz|rover|martin|romeo))?/i, "").trim().split(/\s+/);
    const stop = /^(for|on|at|in|this|next|tomorrow|today|and|with|please|oil|tire|tires|needs?|is|that|it|around|before|after|morning|afternoon|evening|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|my|name|swapped|changed|done|[,.!?])$/i;
    const w: string[] = [];
    for (const x of after) { const c = x.replace(/[,.!?]+$/, ""); if (!c || stop.test(c) || /^\d\.\d/.test(c) || w.length === 2) break; w.push(c); if (x !== c) break; }
    model = w.join(" ") || null;
  }
  const job = /seasonal|oil.{0,20}(and|\+|plus|with).{0,10}tire|tire.{0,20}(and|\+|plus|with).{0,10}oil/.test(low) ? "seasonal"
    : /rotat/.test(low) ? "rotation" : /\b(tire|tyre|wheel)s?\s*(swap|change)|\b(winter|summer) tires|swap.{0,10}tires/.test(low) ? "tires"
    : /diagnos|check engine|warning light|won'?t start|noise|leak/.test(low) ? "diagnostic"
    : /oil/.test(low) ? "oil_change" : /wiper|cabin filter|air filter|battery/.test(low) ? "parts" : null;
  // the day: today, tomorrow, or a weekday (the next one)
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const base = new Date(`${todayIso}T12:00:00Z`);
  const add = (n: number) => { const d = new Date(base); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  let date: string | null = /\btomorrow\b/.test(low) ? add(1) : /\btoday\b|\btonight\b/.test(low) ? add(0) : null;
  if (!date) { const k = days.findIndex((d) => new RegExp(`\\b${d}\\b|\\b${d.slice(0, 3)}\\b`).test(low)); if (k >= 0) date = add(((k - base.getUTCDay() + 7) % 7) || 7); }
  const part = /\bmorning\b|\bam\b/.test(low) ? "morning" : /\bafternoon\b/.test(low) ? "afternoon" : /\bevening\b|\btonight\b|after work/.test(low) ? "evening" : null;
  const tm = low.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  const time = tm ? `${String((Number(tm[1]) % 12) + (tm[3] === "pm" ? 12 : 0)).padStart(2, "0")}:${tm[2] ?? "00"}` : null;
  const name = t.match(/\b(?:[Mm]y name is|[Tt]his is|[Ii]t'?s|[Ii]'?m)\s+([A-Z][a-z]{1,15})\b/)?.[1] ?? null;
  const cars = Number(low.match(/\b(two|2|three|3)\s+(cars|vehicles)\b/)?.[1]?.replace("two", "2").replace("three", "3")) || 1;
  const found = !!(year || make || job || date);
  return found ? { name, year, make, model, engine: low.match(/\b(\d\.\d)\s*l\b/)?.[1] ? `${low.match(/\b(\d\.\d)\s*l\b/)![1]}L` : null,
    job, cars, date, time, part, wantsBooking: !!(job || date || year), notes: null } : null;
}
