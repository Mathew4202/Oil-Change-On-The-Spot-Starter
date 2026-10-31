"use client";
// Calls waiting on us: what they want (read from the call) and one tap to hold the time + text the link.
import { useEffect, useState } from "react";
import { useRole } from "./RoleContext";

const NAVY = "#0d1b3e", GOLD = "#f2b01e", LINE = "#c8d0e0";
type X = { name: string | null; year: number | null; make: string | null; model: string | null; job: string | null; cars: number; notes: string | null; wantsBooking: boolean } | null;
export type Call = { id: string; phone: string | null; status: string | null; at: string; summary: string[] | null; extract: X; suggested: string | null; suggestedText: string | null; wanted?: string | null;
  channel?: string; texts?: { at: string; from: "them" | "us"; body: string; by?: string | null }[] };
// quick replies, signed like every customer text
const QUICK = [
  ["On a job", "Hi, thanks for your message! We're on a job right now, we'll get back to you shortly.\n- {signer}, Oil Change On The Spot"],
  ["Call me", "Hi, thanks for reaching out! Is it okay if I give you a quick call?\n- {signer}, Oil Change On The Spot"],
  ["Which car?", "Hi! What's the year, make and model of the car? I'll get you a price right away.\n- {signer}, Oil Change On The Spot"],
] as const;
const JOB: Record<string, string> = { oil_change: "Oil change", seasonal: "Seasonal package", tires: "Tire change", rotation: "Tire rotation", parts: "Parts", diagnostic: "Diagnostic" };
const fmt = (p: string | null) => p?.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3") ?? "Unknown number";
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-CA", { timeZone: "America/Halifax", hour: "numeric", minute: "2-digit" }).replace(/\./g, "");

export default function CallsPanel({ focus, onChanged, onPickTime }: { focus?: string | null; onChanged: () => void; onPickTime: (c: Call) => void }) {
  const { name } = useRole();
  const me = name ? name.charAt(0).toUpperCase() + name.slice(1) : "Mathew";   // quick replies are signed by whoever is signed in
  const [calls, setCalls] = useState<Call[]>([]); const [busy, setBusy] = useState<string | null>(null); const [msg, setMsg] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const load = () => fetch("/api/owner/calls", { cache: "no-store" }).then((r) => r.json()).then((d) => setCalls(d.calls || [])).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);
  useEffect(() => { if (focus && calls.some((c) => c.id === focus)) document.getElementById(`call-${focus}`)?.scrollIntoView({ block: "center" }); }, [focus, calls]);

  async function act(c: Call, action: string, start?: string, body?: string) {
    setBusy(c.id);
    const r = await fetch("/api/owner/calls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id, action, start, body }) });
    const j = await r.json().catch(() => ({})); setBusy(null);
    if (!r.ok || j.ok === false) return setMsg((m) => ({ ...m, [c.id]: j.error || "That didn't work" }));
    if (action === "reply") { setDraft((d) => ({ ...d, [c.id]: "" })); setMsg((m) => ({ ...m, [c.id]: "Sent." })); load(); return; }
    const sent = j.sms?.sent;
    setMsg((m) => ({ ...m, [c.id]: action === "done" ? "" : sent ? (action === "hold" ? "Held and texted." : "Link texted.") : `Done, but the text didn't go out. Link: ${j.link}` }));
    setTimeout(() => { load(); onChanged(); }, sent || action === "done" ? 900 : 6000);
  }

  if (!calls.length) return null;
  return (
    <section data-tour="calls" className="flex flex-col gap-2" aria-label="Calls to follow up">
      <h2 className="font-extrabold text-lg">{calls.some((c) => c.channel === "text") ? "Calls and texts to follow up" : "Calls to follow up"}</h2>
      {calls.map((c) => {
        const x = c.extract; const car = x ? [x.year, x.make, x.model].filter(Boolean).join(" ") : "";
        const missed = c.status === "unanswered" || c.status === "abandoned";
        return (
          <div key={c.id} id={`call-${c.id}`} className="bg-white rounded-2xl p-4 flex flex-col gap-2 border-2" style={{ borderColor: focus === c.id ? GOLD : "transparent" }}>
            <div className="flex justify-between gap-2">
              <p className="font-bold text-[17px]">{x?.name || fmt(c.phone)}{x?.name ? <span className="font-normal text-[#4a5878]"> · {fmt(c.phone)}</span> : null}</p>
              <span className="text-xs text-[#4a5878] whitespace-nowrap">{c.channel === "text" ? "Text " : missed ? "Missed " : ""}{time(c.at)}</span>
            </div>
            {c.channel === "text" && (
              <div className="flex flex-col gap-1.5">
                {(c.texts ?? []).slice(-6).map((t, i) => (
                  <p key={i} className={`max-w-[85%] rounded-2xl px-3 py-2 text-[15px] whitespace-pre-wrap ${t.from === "us" ? "self-end text-white" : "self-start bg-[#eef1f6]"}`} style={t.from === "us" ? { background: NAVY } : undefined}>{t.body}</p>
                ))}
              </div>
            )}
            {x ? <p className="text-[15px]">{[x.job ? JOB[x.job] : null, car || null, x.cars > 1 ? `${x.cars} cars` : null].filter(Boolean).join(" · ") || "Wants to book"}{x.notes ? <span className="text-[#4a5878]"> · {x.notes}</span> : null}</p>
              : c.summary?.length ? <p className="text-[15px] text-[#4a5878]">{c.summary.join(" ")}</p>
              : c.channel === "text" ? null
              : <p className="text-[15px] text-[#4a5878]">{missed ? "No message. Text them the booking link?" : "Waiting for Quo's summary of the call…"}</p>}
            {!c.suggested && c.wanted && <p className="text-[14px] font-semibold text-[#8a5a00]">They asked for {c.wanted}: that time isn&apos;t open. The link lets them pick another.</p>}
            {msg[c.id] && <p className="text-sm font-semibold text-[#1d6b3a] break-all">{msg[c.id]}</p>}
            <div className="flex flex-wrap gap-2">
              {c.suggested ? <>
                <button disabled={busy === c.id} onClick={() => act(c, "hold")} className="h-11 px-3 rounded-lg font-extrabold text-[15px] disabled:opacity-60" style={{ background: GOLD, color: NAVY }}>Hold {c.suggestedText} + text link</button>
                <button disabled={busy === c.id} onClick={() => act(c, "link")} className="h-11 px-3 rounded-lg border font-bold text-sm bg-white" style={{ borderColor: LINE }}>Text the booking link instead</button>
              </> : <>
                <button disabled={busy === c.id} onClick={() => act(c, "link")} className="h-11 px-3 rounded-lg font-extrabold text-[15px] disabled:opacity-60" style={{ background: GOLD, color: NAVY }}>Text the booking link{x ? " (filled in)" : ""}</button>
                <button disabled={busy === c.id} onClick={() => onPickTime(c)} className="h-11 px-3 rounded-lg border font-bold text-sm bg-white" style={{ borderColor: LINE }}>Hold a time</button>
              </>}
              <button disabled={busy === c.id} onClick={() => act(c, "done")} className="h-11 px-3 rounded-lg font-bold text-sm text-[#4a5878] underline">Done</button>
            </div>
            {c.phone && (
              <div className="flex flex-col gap-2 pt-1">
                <div className="flex flex-wrap gap-1.5">{QUICK.map(([k, v]) => <button key={k} type="button" onClick={() => setDraft((d) => ({ ...d, [c.id]: v.replace("{signer}", me) }))} className="h-8 px-3 rounded-full border text-[13px] font-semibold bg-white" style={{ borderColor: LINE }}>{k}</button>)}</div>
                <div className="flex gap-2">
                  <textarea value={draft[c.id] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [c.id]: e.target.value }))} rows={(draft[c.id] ?? "").length > 60 ? 3 : 1}
                    placeholder={c.channel === "text" ? "Reply…" : "Text them…"} className="flex-1 rounded-xl border px-3 py-2.5 text-[15px] resize-none" style={{ borderColor: LINE }} />
                  <button disabled={busy === c.id || !(draft[c.id] ?? "").trim()} onClick={() => act(c, "reply", undefined, draft[c.id])} className="h-11 px-4 rounded-xl font-bold text-white disabled:opacity-50 self-end" style={{ background: NAVY }}>Send</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
