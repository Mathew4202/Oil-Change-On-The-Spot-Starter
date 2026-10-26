"use client";
import { useEffect, useMemo, useState } from "react";
import { PHONE, PHONE_TEL } from "@/lib/os/business";
import VinSnap from "@/components/VinSnap";
import CarPicker from "@/components/CarPicker";
import EnginePicker from "@/components/EnginePicker";

const NAVY = "#0d1b3e", GOLD = "#f2b01e", LINE = "#c8d0e0", MUTED = "#4a5878";
type Due = { state: "ok" | "soon" | "due" | "booked" | "new"; date: string | null };
type Vehicle = { id: string; unit: string | null; car: string; engine: string | null; plate: string | null; vin: string | null; price: number | null;
  lastService: string | null; lastKm: number | null; booked: string | null; due: Due };
type Data = {
  account: { name: string; contact: string | null; address: string | null; billing: string; terms: number; every: number };
  vehicles: Vehicle[]; upcoming: { id: string; at: string; vehicle: string | null }[];
  history: { date: string; vehicle: string | null; km: number | null; work: string | null; total: number; invoiced: boolean }[];
  invoices: { no: number; link: string; issued: string; due: string | null; total: number; status: string; overdue: boolean }[]; owing: number; error?: string;
};
const money = (n: number) => `$${n.toFixed(2)}`;
const day = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const at = (iso: string) => new Date(iso).toLocaleString("en-CA", { timeZone: "America/Halifax", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const todayHfx = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Halifax" });
const DUE: Record<Due["state"], { text: (v: Vehicle) => string; bg: string; fg: string }> = {
  due: { text: (v) => (v.due.date ? `Due since ${day(v.due.date)}` : "Due"), bg: "#fde2e1", fg: "#9b1c1c" },
  soon: { text: (v) => `Due ${v.due.date ? day(v.due.date) : "soon"}`, bg: "#fff6dd", fg: "#8a5a00" },
  booked: { text: (v) => `Booked ${v.booked ? at(v.booked) : ""}`, bg: "#dff3e6", fg: "#1d6b3a" },
  new: { text: () => "No service with us yet", bg: "#eef1f6", fg: MUTED },
  ok: { text: (v) => (v.due.date ? `Next ${day(v.due.date)}` : ""), bg: "#eef1f6", fg: MUTED },
};
const name = (v: Vehicle) => [v.unit ? `Unit ${v.unit}` : null, v.car].filter(Boolean).join(" · ");

export default function FleetPortal({ token }: { token: string }) {
  const [d, setD] = useState<Data | null>(null); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const [pick, setPick] = useState<string[]>([]);
  const [date, setDate] = useState(todayHfx()); const [slots, setSlots] = useState<{ time: string; label: string; start: string }[] | null>(null); const [start, setStart] = useState("");
  const [note, setNote] = useState(""); const [busy, setBusy] = useState(false); const [bookErr, setBookErr] = useState("");
  const [adding, setAdding] = useState(false); const [nv, setNv] = useState({ unit_number: "", vin: "", plate: "", year: "", make: "", model: "", engine: "" }); const [addErr, setAddErr] = useState("");
  const [tab, setTab] = useState<"history" | "invoices">("invoices");

  const load = () => fetch(`/api/os/fleet-portal?t=${encodeURIComponent(token)}`, { cache: "no-store" }).then((r) => r.json())
    .then((x) => { if (x.error) setErr(x.error); else { setD(x); setPick((p) => p.length ? p : x.vehicles.filter((v: Vehicle) => v.due.state === "due" || v.due.state === "soon").map((v: Vehicle) => v.id)); } })
    .catch(() => setErr("Couldn't load. Check your connection."));
  useEffect(() => { load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSlots(null); setStart("");
    if (!pick.length || !date) return;
    fetch(`/api/os/fleet-portal?t=${encodeURIComponent(token)}&date=${date}&count=${pick.length}`, { cache: "no-store" }).then((r) => r.json()).then((x) => setSlots(x.slots || [])).catch(() => setSlots([]));
  }, [date, pick.length, token]);

  const dueCount = useMemo(() => d?.vehicles.filter((v) => v.due.state === "due" || v.due.state === "soon").length ?? 0, [d]);

  async function book() {
    setBookErr(""); if (!pick.length) return setBookErr("Tick the vehicles you want done."); if (!start) return setBookErr("Pick a start time.");
    setBusy(true);
    const r = await fetch("/api/os/fleet-portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t: token, action: "book", vehicleIds: pick, start, note }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok || !j.ok) return setBookErr(j.error || "Couldn't book. Call or text us.");
    setMsg(`Booked: ${pick.length} vehicle${pick.length > 1 ? "s" : ""} on ${at(start)}. We'll text you a confirmation and a reminder the day before.`);
    setPick([]); setNote(""); setStart(""); load(); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function addVehicle() {
    setAddErr(""); setBusy(true);
    const r = await fetch("/api/os/fleet-portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t: token, action: "vehicle", vehicle: nv }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok || !j.ok) return setAddErr(j.error || "Couldn't add it.");
    setAdding(false); setNv({ unit_number: "", vin: "", plate: "", year: "", make: "", model: "", engine: "" }); setMsg("Vehicle added. We'll set its price and it's ready to book."); load();
  }

  const field = "h-12 rounded-xl border px-3 text-[16px] w-full bg-white";
  if (err) return <main className="min-h-dvh grid place-items-center p-6 text-center text-[#0d1b3e] bg-[#eef1f6]"><div><h1 className="text-2xl font-extrabold">{err}</h1><p className="mt-2">Call or text <a className="underline font-bold" href={PHONE_TEL}>{PHONE}</a>.</p></div></main>;
  if (!d) return <main className="min-h-dvh grid place-items-center bg-[#eef1f6] text-[#4a5878]">Loading…</main>;
  const a = d.account;

  return (
    <div className="min-h-dvh bg-[#eef1f6] text-[#0d1b3e]">
      <header className="text-white px-4 pt-[max(16px,env(safe-area-inset-top))] pb-5" style={{ background: NAVY }}>
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-tight.webp" alt="Oil Change On The Spot" className="h-12 w-auto bg-white rounded-lg p-1" />
          <div className="min-w-0">
            <p className="text-sm text-[#c9d3ea] font-semibold">Fleet account</p>
            <h1 className="text-[28px] leading-none font-extrabold truncate" style={{ fontFamily: "var(--font-condensed), system-ui, sans-serif" }}>{a.name}</h1>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 flex flex-col gap-4 pb-16">
        {msg && <p className="rounded-xl p-3 font-semibold" style={{ background: "#dff3e6", color: "#1d6b3a" }} role="status">{msg}</p>}

        <section className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-white rounded-2xl p-3"><p className="text-[26px] font-extrabold leading-none">{d.vehicles.length}</p><p className="text-sm" style={{ color: MUTED }}>vehicles</p></div>
          <div className="bg-white rounded-2xl p-3"><p className="text-[26px] font-extrabold leading-none" style={{ color: dueCount ? "#9b1c1c" : NAVY }}>{dueCount}</p><p className="text-sm" style={{ color: MUTED }}>due soon</p></div>
          <div className="bg-white rounded-2xl p-3"><p className="text-[22px] font-extrabold leading-none pt-1">{money(d.owing)}</p><p className="text-sm" style={{ color: MUTED }}>owing</p></div>
        </section>

        {d.upcoming.length > 0 && (
          <section className="bg-white rounded-2xl p-4 flex flex-col gap-2">
            <h2 className="font-extrabold text-lg">Booked</h2>
            {d.upcoming.map((u) => <p key={u.id} className="text-[15px]"><strong>{at(u.at)}</strong> · {u.vehicle}</p>)}
            <p className="text-sm" style={{ color: MUTED }}>Need to move a visit? Text <a className="underline font-semibold" href={PHONE_TEL.replace("tel:", "sms:")}>{PHONE}</a>, 24 hours notice please.</p>
          </section>
        )}

        <section className="bg-white rounded-2xl p-4 flex flex-col gap-3">
          <h2 className="font-extrabold text-lg">Book a yard visit</h2>
          <p className="text-sm" style={{ color: MUTED }}>Tick the vehicles, pick a day and a start time. We do them back to back at {a.address || "your yard"}.</p>
          <div className="flex flex-col gap-2">
            {d.vehicles.map((v) => {
              const on = pick.includes(v.id), s = DUE[v.due.state];
              return (
                <label key={v.id} className="flex items-start gap-3 rounded-xl border p-3 cursor-pointer" style={{ borderColor: on ? NAVY : LINE, borderWidth: on ? 2 : 1, background: on ? "#fff6dd" : "#fff" }}>
                  <input type="checkbox" checked={on} disabled={v.due.state === "booked"} onChange={() => setPick((p) => on ? p.filter((x) => x !== v.id) : [...p, v.id])} className="mt-1 w-5 h-5 accent-[#0d1b3e]" />
                  <span className="flex-1 min-w-0">
                    <span className="block font-bold">{name(v)}</span>
                    <span className="block text-sm" style={{ color: MUTED }}>{[v.plate, v.lastService ? `last done ${day(v.lastService)}${v.lastKm ? ` at ${v.lastKm.toLocaleString()} km` : ""}` : null].filter(Boolean).join(" · ")}</span>
                    {s.text(v) && <span className="inline-block mt-1 text-[12px] font-bold rounded-full px-2 py-0.5" style={{ background: s.bg, color: s.fg }}>{s.text(v)}</span>}
                  </span>
                  {v.price != null && <span className="text-sm font-bold whitespace-nowrap text-right">{money(v.price)}<span className="block text-[11px] font-semibold" style={{ color: MUTED }}>+ HST</span></span>}
                </label>
              );
            })}
            {!d.vehicles.length && <p style={{ color: MUTED }}>No vehicles yet. Add one below.</p>}
          </div>
          {pick.length > 0 && (
            <>
              <label className="flex flex-col gap-1 text-sm font-semibold" style={{ color: MUTED }}>Day
                <input type="date" value={date} min={todayHfx()} onChange={(e) => setDate(e.target.value)} className={field} style={{ borderColor: LINE }} />
              </label>
              <div className="flex flex-wrap gap-2" aria-live="polite">
                {slots == null ? <p className="text-sm" style={{ color: MUTED }}>Checking open times…</p>
                  : slots.length ? slots.map((s) => <button key={s.start} type="button" onClick={() => setStart(s.start)} className="h-11 px-4 rounded-full border font-bold" style={{ background: start === s.start ? NAVY : "#fff", color: start === s.start ? "#fff" : NAVY, borderColor: start === s.start ? NAVY : LINE }}>{s.label}</button>)
                  : <p className="text-sm font-semibold text-[#8a5a00]">No room for {pick.length} vehicle{pick.length > 1 ? "s" : ""} that day. Try another day, or fewer vehicles.</p>}
              </div>
              <label className="flex flex-col gap-1 text-sm font-semibold" style={{ color: MUTED }}>Anything we should know? (optional)
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Gate code, where the vans are parked, a warning light" className={field} style={{ borderColor: LINE }} />
              </label>
              {bookErr && <p className="text-sm font-semibold text-[#b3261e]" role="alert">{bookErr}</p>}
              <button onClick={book} disabled={busy} className="h-14 rounded-xl font-extrabold text-[17px] disabled:opacity-60" style={{ background: GOLD, color: NAVY }}>{busy ? "Booking…" : `Book ${pick.length} vehicle${pick.length > 1 ? "s" : ""}`}</button>
              <p className="text-sm" style={{ color: MUTED }}>Billed to your account{a.billing === "per_job" ? ", one invoice per visit" : " on your monthly invoice"}, due in {a.terms} days.</p>
            </>
          )}
        </section>

        <section className="bg-white rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex justify-between items-center"><h2 className="font-extrabold text-lg">Add a vehicle</h2>
            {!adding && <button onClick={() => setAdding(true)} className="h-10 px-4 rounded-full border font-bold" style={{ borderColor: NAVY }}>+ Add</button>}</div>
          {adding && (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <input value={nv.unit_number} onChange={(e) => setNv({ ...nv, unit_number: e.target.value })} placeholder="Unit #" className={field} style={{ borderColor: LINE }} />
                <input value={nv.plate} onChange={(e) => setNv({ ...nv, plate: e.target.value.toUpperCase() })} placeholder="Plate" className={field} style={{ borderColor: LINE }} />
              </div>
              <VinSnap vin={nv.vin} onVin={(v) => setNv((x) => ({ ...x, vin: v }))}
                onDecoded={(d, v) => setNv((x) => ({ ...x, vin: v, year: d.year ? String(d.year) : x.year, make: d.make ?? x.make, model: d.model ?? x.model, engine: d.engineL ? `${d.engineL}L` : x.engine }))} />
              <CarPicker year={nv.year} make={nv.make} model={nv.model} onChange={(c) => setNv((x) => ({ ...x, ...c }))} />
              <EnginePicker year={nv.year} make={nv.make} model={nv.model} value={nv.engine} onChange={(e) => setNv((x) => ({ ...x, engine: e === "unsure" ? "" : e }))} />
              {addErr && <p className="text-sm font-semibold text-[#b3261e]" role="alert">{addErr}</p>}
              <div className="flex gap-2"><button onClick={addVehicle} disabled={busy} className="h-12 flex-1 rounded-xl font-bold text-white disabled:opacity-60" style={{ background: NAVY }}>{busy ? "Adding…" : "Add vehicle"}</button>
                <button onClick={() => setAdding(false)} className="h-12 px-4 rounded-xl border font-bold" style={{ borderColor: LINE }}>Cancel</button></div>
            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex gap-2">
            {(["invoices", "history"] as const).map((t) => <button key={t} onClick={() => setTab(t)} className="h-10 px-4 rounded-full border font-bold" style={{ background: tab === t ? NAVY : "#fff", color: tab === t ? "#fff" : NAVY, borderColor: tab === t ? NAVY : LINE }}>{t === "invoices" ? "Invoices" : "Service history"}</button>)}
          </div>
          {tab === "invoices" ? (d.invoices.length ? d.invoices.map((i) => (
            <a key={i.no} href={i.link} target="_blank" rel="noreferrer" className="flex justify-between gap-3 border-b pb-2 last:border-0" style={{ borderColor: LINE }}>
              <span><span className="font-bold">Invoice {i.no}</span><span className="block text-sm" style={{ color: MUTED }}>{day(i.issued)}{i.due && i.status === "open" ? ` · due ${day(i.due)}` : ""}</span></span>
              <span className="text-right"><span className="font-bold">{money(i.total)}</span>
                <span className="block text-[12px] font-bold" style={{ color: i.status === "paid" ? "#1d6b3a" : i.overdue ? "#9b1c1c" : "#8a5a00" }}>{i.status === "paid" ? "Paid" : i.overdue ? "Overdue · pay" : "Open · pay"}</span></span>
            </a>)) : <p style={{ color: MUTED }}>No invoices yet.</p>)
          : (d.history.length ? d.history.map((h, k) => (
            <div key={k} className="flex justify-between gap-3 border-b pb-2 last:border-0" style={{ borderColor: LINE }}>
              <span className="min-w-0"><span className="font-bold">{day(h.date)}</span> · {h.vehicle}<span className="block text-sm" style={{ color: MUTED }}>{[h.work, h.km ? `${h.km.toLocaleString()} km` : null].filter(Boolean).join(" · ")}</span></span>
              <span className="font-bold whitespace-nowrap">{money(h.total)}</span>
            </div>)) : <p style={{ color: MUTED }}>Nothing yet.</p>)}
        </section>

        <p className="text-center text-sm" style={{ color: MUTED }}>Questions? Call or text <a className="underline font-semibold" href={PHONE_TEL}>{PHONE}</a>. Keep this link private, it works like a key to your account.</p>
      </main>
    </div>
  );
}
