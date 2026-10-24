"use client";
// Owners: move a booking to any free time, or cancel it. The customer gets a text either way.
import { useState } from "react";

const NAVY = "#0d1b3e", GOLD = "#f2b01e", LINE = "#c8d0e0";
function halifaxIso(date: string, hhmm: string) {
  const [y, m, d] = date.split("-").map(Number); const [h, mi] = hhmm.split(":").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, h, mi));
  const off = (at: Date) => { const n = new Intl.DateTimeFormat("en-US", { timeZone: "America/Halifax", timeZoneName: "longOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value || "GMT-04:00";
    const x = n.match(/GMT([+-])(\d{2}):(\d{2})/); return x ? (x[1] === "-" ? -1 : 1) * (Number(x[2]) * 60 + Number(x[3])) : -240; };
  return new Date(guess.getTime() - off(new Date(guess.getTime() - off(guess) * 60000)) * 60000).toISOString();
}

export default function ChangeBooking({ bookingId, name, date: initialDate, onClose }: { bookingId: string; name: string; date: string; onClose: (newDate?: string | null) => void }) {
  const [mode, setMode] = useState<"move" | "cancel">("move");
  const [date, setDate] = useState(initialDate); const [time, setTime] = useState("");
  const [reason, setReason] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  async function go() {
    setErr("");
    if (mode === "move" && !time) return setErr("Pick the new time");
    setBusy(true);
    const r = await fetch("/api/owner/manage", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode === "move" ? { bookingId, action: "move", start: halifaxIso(date, time) } : { bookingId, action: "cancel", reason }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) return setErr(j.error || "Couldn't save");
    onClose(mode === "move" ? date : null);
  }
  const chip = (on: boolean) => ({ background: on ? NAVY : "#fff", color: on ? "#fff" : NAVY, borderColor: on ? NAVY : LINE });
  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center" onClick={() => onClose(undefined)}>
      <div className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-5 flex flex-col gap-3 pb-[max(20px,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Change booking">
        <h2 className="text-2xl font-extrabold" style={{ fontFamily: "var(--font-condensed)" }}>Change {name}&apos;s booking</h2>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setMode("move")} className="h-11 rounded-lg border font-bold" style={chip(mode === "move")}>Move it</button>
          <button onClick={() => setMode("cancel")} className="h-11 rounded-lg border font-bold" style={chip(mode === "cancel")}>Cancel it</button>
        </div>
        {mode === "move" ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm font-semibold">Day<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-12 rounded-xl border px-3 text-base" style={{ borderColor: LINE }} /></label>
            <label className="flex flex-col gap-1 text-sm font-semibold">Time<input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-12 rounded-xl border px-3 text-base" style={{ borderColor: LINE }} /></label>
          </div>
        ) : (
          <label className="flex flex-col gap-1 text-sm font-semibold">Reason (optional)<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Customer called, weather…" className="h-12 rounded-xl border px-3 text-base font-normal" style={{ borderColor: LINE }} /></label>
        )}
        <p className="text-sm text-[#4a5878]">The customer gets a text about the change.</p>
        {err && <p className="text-sm text-red-700" role="alert">{err}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => onClose(undefined)} className="h-12 rounded-xl border font-bold" style={{ borderColor: LINE }}>Back</button>
          <button onClick={go} disabled={busy} className="h-12 rounded-xl font-extrabold disabled:opacity-60" style={mode === "cancel" ? { background: "#9b1c1c", color: "#fff" } : { background: GOLD, color: NAVY }}>
            {busy ? "Saving…" : mode === "cancel" ? "Cancel booking" : "Move booking"}
          </button>
        </div>
      </div>
    </div>
  );
}
