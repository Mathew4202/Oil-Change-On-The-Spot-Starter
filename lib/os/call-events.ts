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
  const ext = c.participants?.external?.[0] ?? r.fromPhoneNumber ?? (r.direction === "incoming" ? r.from : Array.isArray(r.to) ? r.to[0] : r.to) ?? r.from ?? null;
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

/** Pick the open time that best matches what the caller asked for (slots are for one day, start times in Halifax "HH:MM"). */
export function pickSlot<T extends { time: string }>(slots: T[], want: Want): T | null {
  if (!slots.length) return null;
  const min = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  if (want.time && /^\d{1,2}:\d{2}$/.test(want.time)) {
    const target = min(want.time);
    const best = [...slots].sort((a, b) => Math.abs(min(a.time) - target) - Math.abs(min(b.time) - target))[0];
    return Math.abs(min(best.time) - target) <= 90 ? best : null;
  }
  const range = want.part === "morning" ? [0, 720] : want.part === "afternoon" ? [720, 1020] : want.part === "evening" ? [1020, 1440] : [0, 1440];
  return slots.find((s) => min(s.time) >= range[0] && min(s.time) < range[1]) ?? null;
}
