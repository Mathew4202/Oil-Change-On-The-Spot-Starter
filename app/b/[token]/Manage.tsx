"use client";
// Customer's private link: see the booking, move it to another open time, or cancel.
import { useEffect, useMemo, useState } from "react";
import { PHONE, PHONE_TEL } from "@/lib/os/business";

const NAVY = "#0d1b3e", GOLD = "#f2b01e", LINE = "#c8d0e0";
type B = { id: string; start: string; status: string; address: string | null; total: number | null; job: string; addons: string[]; cars: number; firstName: string; car: string; visitMinutes?: number };
type Slot = { label: string; start: string };
const TZ = "America/Halifax";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const addDays = (d: string, n: number) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
const long = (iso: string) => new Date(iso).toLocaleString("en-CA", { timeZone: TZ, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).replace(/\./g, "");
const dayBits = (d: string) => { const [y, m, dd] = d.split("-").map(Number); const x = new Date(Date.UTC(y, m - 1, dd, 12)); return { dow: x.toLocaleDateString("en-CA", { timeZone: "UTC", weekday: "short" }), n: dd, mon: x.toLocaleDateString("en-CA", { timeZone: "UTC", month: "short" }) }; };

export default function Manage({ token }: { token: string }) {
  const [b, setB] = useState<B | null>(null);
  const [can, setCan] = useState(false); const [hours, setHours] = useState(24);
  const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const [mode, setMode] = useState<"view" | "move" | "cancel">("view");
  const [date, setDate] = useState(today()); const [slots, setSlots] = useState<Slot[] | null>(null); const [slot, setSlot] = useState<Slot | null>(null);
  const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch(`/api/os/manage?t=${encodeURIComponent(token)}`); const j = await r.json();
    if (!r.ok) return setErr(j.error); setB(j.booking); setCan(j.canChange); setHours(j.freeCancelHours);
  }
  useEffect(() => { load(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (mode !== "move" || !b) return; setSlots(null); setSlot(null);
    const tires = b.job === "oil_change" && b.addons.includes("tires") ? "tires" : "";
    fetch(`/api/os/slots?date=${date}&job=${b.job}&cars=${b.cars}&addons=${tires}${b.visitMinutes ? `&visit=${b.visitMinutes}` : ""}`).then((r) => r.json()).then((d) => setSlots(d.slots || [])).catch(() => setSlots([]));
  }, [mode, date, b]);
  const days = useMemo(() => Array.from({ length: 30 }, (_, i) => addDays(today(), i)), []);

  async function act(body: object, done: string) {
    setBusy(true); setErr("");
    const r = await fetch("/api/os/manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t: token, ...body }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) return setErr(j.error || `Something went wrong. Please call or text ${PHONE}.`);
    setMsg(done); setMode("view"); load();
  }

  const btn = "h-[52px] rounded-xl font-extrabold text-[17px] w-full";
  return (
    <div className="min-h-dvh bg-[#eef1f6] flex justify-center">
      <div className="w-full max-w-md min-h-dvh bg-white flex flex-col text-[#0d1b3e]">
        <header className="text-white px-5 pt-[max(18px,env(safe-area-inset-top))] pb-5" style={{ background: NAVY }}>
          <p className="text-sm font-bold tracking-widest" style={{ color: GOLD }}>OIL CHANGE ON THE SPOT</p>
          <h1 className="text-[28px] font-extrabold leading-tight">Your booking</h1>
        </header>
        <main className="p-5 flex flex-col gap-4">
          {err && <p className="rounded-xl bg-red-50 text-red-800 p-3" role="alert">{err}</p>}
          {msg && <p className="rounded-xl p-3 font-semibold" style={{ background: "#dff3e6", color: "#1d6b3a" }} role="status">{msg}</p>}
          {!b && !err && <p className="text-[#4a5878]">Loading…</p>}
          {b && (
            <div className="rounded-2xl border p-4 flex flex-col gap-1" style={{ borderColor: LINE }}>
              <p className="text-sm font-bold text-[#4a5878]">{b.status === "cancelled" ? "CANCELLED" : b.status === "done" ? "DONE" : "BOOKED"}</p>
              <p className="text-xl font-bold">{long(b.start)}</p>
              <p className="text-[#4a5878]">{b.car}</p>
              {b.address && <p className="text-[#4a5878]">{b.address}</p>}
              {b.total != null && <p className="text-[#4a5878]">Total ${Number(b.total).toFixed(2)} with HST, paid after the job</p>}
            </div>
          )}

          {b && mode === "view" && ["confirmed", "requested"].includes(b.status) && (can ? (
            <div className="flex flex-col gap-2">
              <button onClick={() => setMode("move")} className={btn} style={{ background: GOLD, color: NAVY }}>Change the time</button>
              <button onClick={() => setMode("cancel")} className={`${btn} border bg-white`} style={{ borderColor: LINE }}>Cancel booking</button>
              <p className="text-sm text-[#4a5878]">You can change or cancel here up to {hours} hours before your time.</p>
            </div>
          ) : (
            <p className="rounded-xl bg-[#fff6dd] p-4">It&apos;s less than {hours} hours to your time, so please call or text <a className="font-bold underline" href={PHONE_TEL}>{PHONE}</a> to change it. Cancelling on the day may have a $30 + HST fee (we waive it for emergencies and bad storms).</p>
          ))}

          {b && mode === "move" && (
            <div className="flex flex-col gap-3">
              <p className="font-bold text-lg">Pick a new day and time</p>
              <div className="-mx-5 px-5 overflow-x-auto"><div className="flex gap-2 w-max pb-1">
                {days.map((d) => { const x = dayBits(d), on = d === date; return (
                  <button key={d} onClick={() => setDate(d)} aria-pressed={on} className="w-[64px] h-[70px] rounded-xl border flex flex-col items-center justify-center"
                    style={{ borderColor: on ? NAVY : LINE, borderWidth: on ? 2 : 1, background: on ? GOLD : "#fff" }}>
                    <span className="text-[13px] font-semibold">{d === today() ? "Today" : x.dow}</span><span className="text-[21px] font-extrabold leading-none">{x.n}</span><span className="text-[11px] text-[#4a5878]">{x.mon}</span>
                  </button>); })}
              </div></div>
              {slots === null ? <p className="text-[#4a5878]">Checking…</p> : slots.length === 0 ? <p className="rounded-xl bg-[#eef1f6] p-3 text-[#4a5878]">No open times this day. Try another day.</p> : (
                <div className="grid grid-cols-3 gap-2">{slots.map((s) => (
                  <button key={s.start} onClick={() => setSlot(s)} aria-pressed={slot?.start === s.start} className="h-12 rounded-xl border font-bold"
                    style={{ borderColor: slot?.start === s.start ? NAVY : LINE, borderWidth: slot?.start === s.start ? 2 : 1, background: slot?.start === s.start ? GOLD : "#fff" }}>{s.label}</button>
                ))}</div>
              )}
              <button disabled={!slot || busy} onClick={() => slot && act({ action: "move", start: slot.start }, `Done. You're now booked for ${long(slot.start)}.`)} className={`${btn} disabled:opacity-50`} style={{ background: GOLD, color: NAVY }}>{busy ? "Saving…" : "Move my booking"}</button>
              <button onClick={() => setMode("view")} className="h-11 font-semibold underline text-[#4a5878]">Keep my current time</button>
            </div>
          )}

          {b && mode === "cancel" && (
            <div className="flex flex-col gap-3">
              <p className="font-bold text-lg">Cancel this booking?</p>
              <label className="flex flex-col gap-1 text-sm font-semibold text-[#4a5878]">Reason (optional)
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Helps us improve" className="h-[52px] rounded-xl border px-3 text-[17px]" style={{ borderColor: LINE }} />
              </label>
              <button disabled={busy} onClick={() => act({ action: "cancel", reason }, "Your booking is cancelled. Book again any time.")} className={`${btn} text-white disabled:opacity-50`} style={{ background: "#9b1c1c" }}>{busy ? "Cancelling…" : "Yes, cancel it"}</button>
              <button onClick={() => setMode("view")} className="h-11 font-semibold underline text-[#4a5878]">Keep my booking</button>
            </div>
          )}

          {b && b.status === "cancelled" && <a href="/booking" className={`${btn} flex items-center justify-center`} style={{ background: GOLD, color: NAVY }}>Book a new time</a>}
          <p className="text-sm text-[#4a5878] mt-2">Questions? Call or text <a className="font-bold underline" href={PHONE_TEL}>{PHONE}</a>.</p>
        </main>
      </div>
    </div>
  );
}
