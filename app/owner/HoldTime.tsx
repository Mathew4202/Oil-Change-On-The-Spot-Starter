"use client";
// On a call: hold a time for them, and text them a link to finish booking with their own details.
import { useEffect, useState } from "react";

const NAVY = "#0d1b3e", GOLD = "#f2b01e", LINE = "#c8d0e0";
const field = "h-12 rounded-xl border px-3 text-base w-full bg-white font-normal";
const lbl = "flex flex-col gap-1 text-sm font-semibold";
const JOBS: [string, string][] = [["oil_change", "Oil change"], ["seasonal", "Seasonal package"], ["tires", "Tire change"], ["rotation", "Tire rotation"], ["parts", "Parts only"], ["diagnostic", "Diagnostic"]];

function halifaxIso(date: string, hhmm: string) {
  const [y, m, d] = date.split("-").map(Number); const [h, mi] = hhmm.split(":").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, h, mi));
  const off = (at: Date) => {
    const n = new Intl.DateTimeFormat("en-US", { timeZone: "America/Halifax", timeZoneName: "longOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value || "GMT-04:00";
    const x = n.match(/GMT([+-])(\d{2}):(\d{2})/); return x ? (x[1] === "-" ? -1 : 1) * (Number(x[2]) * 60 + Number(x[3])) : -240;
  };
  return new Date(guess.getTime() - off(new Date(guess.getTime() - off(guess) * 60000)) * 60000).toISOString();
}

export type HoldPreset = { callId?: string; name?: string | null; phone?: string | null; job?: string | null; cars?: number; note?: string | null };
type Slot = { time: string; label: string; start: string };

export default function HoldTime({ date: startDate, onClose, preset }: { date: string; onClose: (saved: boolean) => void; preset?: HoldPreset }) {
  const [date, setDate] = useState(startDate);
  const [time, setTime] = useState(""); const [name, setName] = useState(preset?.name ?? ""); const [phone, setPhone] = useState((preset?.phone ?? "").replace(/^\+1/, ""));
  const [job, setJob] = useState(preset?.job || "oil_change"); const [cars, setCars] = useState(preset?.cars || 1); const [hours, setHours] = useState(2); const [note, setNote] = useState(preset?.note ?? "");
  const [slots, setSlots] = useState<Slot[] | null>(null); const [custom, setCustom] = useState(false);
  // open times for that day, the same ones customers see
  useEffect(() => {
    setSlots(null); setTime("");
    fetch(`/api/os/slots?date=${date}&job=${job}&cars=${cars}`).then((r) => r.json()).then((d) => setSlots(d.slots || [])).catch(() => setSlots([]));
  }, [date, job, cars]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [done, setDone] = useState<{ sent: boolean; status: string; link: string } | null>(null);

  async function save() {
    setErr("");
    if (phone.replace(/\D/g, "").length < 10) return setErr("Add their 10-digit mobile number.");
    if (!time) return setErr("Tap a time.");
    setBusy(true);
    const r = preset?.callId
      ? await fetch("/api/owner/calls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: preset.callId, action: "hold", start: halifaxIso(date, time) }) })
      : await fetch("/api/owner/hold", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", start: halifaxIso(date, time), firstName: name, phone, job, cars, hours, note }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok || !j.ok) return setErr(j.error || "Couldn't hold it");
    setDone({ sent: !!j.sms?.sent, status: j.sms?.status ?? "", link: j.link });
  }
  const chip = (on: boolean) => ({ background: on ? NAVY : "#fff", color: on ? "#fff" : NAVY, borderColor: on ? NAVY : LINE });
  return (
    <div className="fixed inset-0 z-30 bg-black/40 flex items-end sm:items-center justify-center" onClick={() => onClose(!!done)}>
      <div className="w-full max-w-md max-h-[92dvh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl p-5 flex flex-col gap-3 pb-[max(20px,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Hold a time">
        <h2 className="text-2xl font-extrabold" style={{ fontFamily: "var(--font-condensed)" }}>Hold a time for a caller</h2>
        {done ? (
          <>
            <p className="rounded-xl p-3 font-semibold" style={done.sent ? { background: "#dff3e6", color: "#1d6b3a" } : { background: "#fff6dd", color: "#8a5a00" }}>
              {done.sent ? "Held, and the link is texted to them. Once they fill it in, it becomes a normal booking and you both get the alert."
                : done.status === "opted_out" ? "Held, but they turned texts off. Read them the link or send it another way."
                : "Held, but the text didn't go out (texting isn't set up yet). Send them the link yourself:"}
            </p>
            {!done.sent && <p className="font-mono text-sm break-all select-all rounded-lg p-2" style={{ background: "#eef1f6" }}>{done.link}</p>}
            <button onClick={() => onClose(true)} className="h-12 rounded-xl font-extrabold" style={{ background: GOLD, color: NAVY }}>Done</button>
          </>
        ) : (
          <>
            <p className="text-sm text-[#4a5878]">Nobody else can book this time until it runs out. They get a text with a link to add their car, address and details.</p>
            <div className="grid grid-cols-2 gap-2">
              <label className={lbl}>Their first name<input value={name} onChange={(e) => setName(e.target.value)} className={field} style={{ borderColor: LINE }} /></label>
              <label className={lbl}>Mobile<input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" className={field} style={{ borderColor: LINE }} /></label>
            </div>
            <label className={lbl}>Day<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} style={{ borderColor: LINE }} /></label>
            <div className="flex flex-col gap-1 text-sm font-semibold">Tap a time
              {custom ? <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} style={{ borderColor: LINE }} />
                : slots === null ? <p className="font-normal text-[#4a5878]">Loading open times…</p>
                : slots.length === 0 ? <p className="font-normal text-[#4a5878]">No open times this day. Try another day, or set a time yourself.</p>
                : <div className="grid grid-cols-4 gap-2">{slots.map((s) => <button key={s.start} type="button" onClick={() => setTime(s.time)} className="h-11 rounded-lg border text-sm font-bold" style={chip(time === s.time)}>{s.label}</button>)}</div>}
              <button type="button" onClick={() => { setCustom((c) => !c); setTime(""); }} className="self-start text-sm underline font-semibold">{custom ? "Show open times" : "Set a time myself"}</button>
            </div>
            <div className="flex flex-col gap-1 text-sm font-semibold">What for
              <div className="grid grid-cols-3 gap-2">{JOBS.map(([k, n]) => <button key={k} type="button" onClick={() => setJob(k)} className="h-11 rounded-lg border text-[13px] font-bold" style={chip(job === k)}>{n}</button>)}</div>
            </div>
            <div className="flex flex-col gap-1 text-sm font-semibold">Cars
              <div className="grid grid-cols-4 gap-2">{[1, 2, 3, 4].map((n) => <button key={n} type="button" onClick={() => setCars(n)} className="h-11 rounded-lg border font-bold" style={chip(cars === n)}>{n}</button>)}</div>
            </div>
            <div className="flex flex-col gap-1 text-sm font-semibold">Hold it for
              <div className="grid grid-cols-4 gap-2">{[[1, "1 hour"], [2, "2 hours"], [4, "4 hours"], [24, "A day"]].map(([h, n]) => <button key={h} type="button" onClick={() => setHours(Number(h))} className="h-11 rounded-lg border text-sm font-bold" style={chip(hours === h)}>{n}</button>)}</div>
            </div>
            <label className={lbl}>Note (optional)<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 2019 Civic, wants wipers too" className={field} style={{ borderColor: LINE }} /></label>
            {err && <p className="text-sm text-red-700" role="alert">{err}</p>}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => onClose(false)} className="h-12 rounded-xl border font-bold" style={{ borderColor: LINE }}>Cancel</button>
              <button onClick={save} disabled={busy} className="h-12 rounded-xl font-extrabold disabled:opacity-60" style={{ background: GOLD, color: NAVY }}>{busy ? "Holding…" : "Hold and text link"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
