"use client";
// Owners: fix a booking's details (name, phone, email, address, car, note). Moving the time and the price have their own buttons.
import { useEffect, useState } from "react";

const NAVY = "#0d1b3e", GOLD = "#f2b01e", LINE = "#c8d0e0";
const field = "h-12 rounded-xl border px-3 text-base w-full bg-white font-normal";
const lbl = "flex flex-col gap-1 text-sm font-semibold min-w-0";

type Car = { year: string; make: string; model: string; engine: string };
type Oil = { grade: string; litres: string; filter: string };
type Parts = { cabin: string; air: string; wiperDriver: string; wiperPassenger: string };
type Details = { firstName: string; lastName: string; phone: string; email: string; address: string; notes: string; hasCustomer: boolean; fleet: boolean; car: Car;
  withOil: boolean; cars: number; oil: Oil; addons: string[]; parts: Parts; stock: { filter: number | null; oil: number | null } };

export default function EditBooking({ bookingId, onClose }: { bookingId: string; onClose: (saved: boolean) => void }) {
  const [d, setD] = useState<Details | null>(null); const [start, setStart] = useState<Details | null>(null);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch(`/api/owner/manage?bookingId=${bookingId}`).then((r) => r.json()).then((j) => {
      if (j.error) { setErr(j.error); return; }
      setD(j); setStart(j);
    }).catch(() => setErr("Couldn't load the booking"));
  }, [bookingId]);
  const set = (k: keyof Details, v: string) => setD((x) => (x ? { ...x, [k]: v } : x));
  const setCar = (k: keyof Car, v: string) => setD((x) => (x ? { ...x, car: { ...x.car, [k]: v } } : x));
  const setOil = (k: keyof Oil, v: string) => setD((x) => (x ? { ...x, oil: { ...x.oil, [k]: v } } : x));
  const setPart = (k: keyof Parts, v: string) => setD((x) => (x ? { ...x, parts: { ...x.parts, [k]: v } } : x));

  async function save() {
    if (!d || !start) return;
    setErr("");
    // only send what changed
    const edit: Record<string, unknown> = {};
    for (const k of ["firstName", "lastName", "phone", "email", "address", "notes"] as const) if (d[k] !== start[k]) edit[k] = d[k];
    if (JSON.stringify(d.car) !== JSON.stringify(start.car)) edit.car = d.car;
    if (JSON.stringify(d.oil) !== JSON.stringify(start.oil)) edit.oil = d.oil;
    const partsChanged = (Object.keys(d.parts ?? {}) as (keyof Parts)[]).filter((k) => d.parts[k] !== start.parts[k]);
    if (partsChanged.length) edit.parts = Object.fromEntries(partsChanged.map((k) => [k, d.parts[k]]));
    if (!Object.keys(edit).length) return onClose(false);
    setBusy(true);
    const r = await fetch("/api/owner/manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookingId, action: "edit", edit }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok || !j.ok) return setErr(j.error || "Couldn't save");
    onClose(true);
  }

  return (
    <div className="fixed inset-0 z-30 bg-black/40 flex items-end sm:items-center justify-center" onClick={() => onClose(false)}>
      <div className="w-full max-w-md max-h-[92dvh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl p-5 flex flex-col gap-3 pb-[max(20px,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Edit booking">
        <h2 className="text-2xl font-extrabold" style={{ fontFamily: "var(--font-condensed)", color: NAVY }}>Edit booking</h2>
        {!d ? <p className="text-[#4a5878]">{err || "Loading…"}</p> : (
          <>
            {d.hasCustomer && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <label className={lbl}>First name<input id="eb-first" value={d.firstName} onChange={(e) => set("firstName", e.target.value)} className={field} style={{ borderColor: LINE }} /></label>
                  <label className={lbl}>Last name<input id="eb-last" value={d.lastName} onChange={(e) => set("lastName", e.target.value)} className={field} style={{ borderColor: LINE }} /></label>
                </div>
                <label className={lbl}>Mobile<input id="eb-phone" value={d.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" className={field} style={{ borderColor: LINE }} /></label>
                <label className={lbl}>Email<input id="eb-email" value={d.email} onChange={(e) => set("email", e.target.value)} inputMode="email" autoCapitalize="none" className={field} style={{ borderColor: LINE }} /></label>
              </>
            )}
            <label className={lbl}>Address we&apos;re going to<input id="eb-address" value={d.address} onChange={(e) => set("address", e.target.value)} className={field} style={{ borderColor: LINE }} /></label>
            {d.hasCustomer && (
              <>
                <p className="text-sm font-bold mt-1" style={{ color: NAVY }}>Car</p>
                <div className="grid grid-cols-3 gap-2">
                  <label className={lbl}>Year<input id="eb-year" value={d.car.year} onChange={(e) => setCar("year", e.target.value)} inputMode="numeric" className={field} style={{ borderColor: LINE }} /></label>
                  <label className={`${lbl} col-span-2`}>Make<input id="eb-make" value={d.car.make} onChange={(e) => setCar("make", e.target.value)} className={field} style={{ borderColor: LINE }} /></label>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <label className={`${lbl} col-span-2`}>Model<input id="eb-model" value={d.car.model} onChange={(e) => setCar("model", e.target.value)} className={field} style={{ borderColor: LINE }} /></label>
                  <label className={lbl}>Engine<input id="eb-engine" value={d.car.engine} onChange={(e) => setCar("engine", e.target.value)} placeholder="2.0L" className={field} style={{ borderColor: LINE }} /></label>
                </div>
              </>
            )}
            {d.fleet && <p className="text-xs text-[#4a5878]">Fleet booking: change the van itself under Fleets.</p>}
            {d.withOil && (
              <>
                <p className="text-sm font-bold mt-1" style={{ color: NAVY }}>Oil and filter</p>
                <div className="grid grid-cols-3 gap-2">
                  <label className={lbl}>Oil<input id="eb-grade" value={d.oil.grade} onChange={(e) => setOil("grade", e.target.value)} placeholder="0W-20" autoCapitalize="characters" className={field} style={{ borderColor: LINE }} /></label>
                  <label className={lbl}>{d.cars > 1 ? "Litres each" : "Litres"}<input id="eb-litres" value={d.oil.litres} onChange={(e) => setOil("litres", e.target.value)} inputMode="decimal" placeholder="4.4" className={field} style={{ borderColor: LINE }} /></label>
                  <label className={lbl}>Filter<input id="eb-filter" value={d.oil.filter} onChange={(e) => setOil("filter", e.target.value)} placeholder="27356" autoCapitalize="characters" className={field} style={{ borderColor: LINE }} /></label>
                </div>
                {start?.oil.grade && (d.stock.filter != null || d.stock.oil != null) && JSON.stringify(d.oil) === JSON.stringify(start.oil) && (
                  <p className="text-xs text-[#4a5878]">In Stock: {d.stock.filter != null ? `${d.stock.filter} of filter ${start.oil.filter}` : `filter ${start.oil.filter || "?"} not in Stock`}{d.stock.oil != null ? `, ${d.stock.oil} L of ${start.oil.grade}` : ""}</p>
                )}
                {!start?.oil.grade && <p className="text-xs font-semibold" style={{ color: "#8a5a00" }}>No oil on file for this car yet. Add it and it&apos;s saved for this car and every one like it.</p>}
              </>
            )}
            {d.addons?.length > 0 && (
              <>
                <p className="text-sm font-bold mt-1" style={{ color: NAVY }}>Add-on parts</p>
                <div className="grid grid-cols-2 gap-2">
                  {d.addons.includes("cabin_filter") && <label className={lbl}>Cabin filter #<input id="eb-cabin" value={d.parts.cabin} onChange={(e) => setPart("cabin", e.target.value)} placeholder="e.g. CAF1882P" autoCapitalize="characters" className={field} style={{ borderColor: LINE }} /></label>}
                  {d.addons.includes("engine_filter") && <label className={lbl}>Engine air filter #<input id="eb-air" value={d.parts.air} onChange={(e) => setPart("air", e.target.value)} placeholder="e.g. FA1883" autoCapitalize="characters" className={field} style={{ borderColor: LINE }} /></label>}
                  {d.addons.includes("wipers") && <>
                    <label className={lbl}>Wiper driver (in.)<input id="eb-wd" value={d.parts.wiperDriver} onChange={(e) => setPart("wiperDriver", e.target.value)} placeholder="26" inputMode="numeric" className={field} style={{ borderColor: LINE }} /></label>
                    <label className={lbl}>Wiper passenger (in.)<input id="eb-wp" value={d.parts.wiperPassenger} onChange={(e) => setPart("wiperPassenger", e.target.value)} placeholder="18" inputMode="numeric" className={field} style={{ borderColor: LINE }} /></label>
                  </>}
                </div>
              </>
            )}
            <label className={lbl}>Note (just for you two)<textarea id="eb-notes" value={d.notes} onChange={(e) => set("notes", e.target.value)} rows={3} className="rounded-xl border px-3 py-2 text-base w-full font-normal" style={{ borderColor: LINE }} /></label>
            <p className="text-xs text-[#4a5878]">Name, phone and email change on their customer file too. Oil, litres, filters and wiper sizes are saved for this car (and the same car for other customers), so the bring list, the job sheet and the profit use them. Stock comes off when you finish the job. The price stays the same, so use Edit price if the new car costs more or less.</p>
            {err && <p className="text-sm font-semibold text-[#9b1c1c]" role="alert">{err}</p>}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => onClose(false)} className="h-12 rounded-xl border font-bold" style={{ borderColor: LINE }}>Back</button>
              <button onClick={save} disabled={busy} className="h-12 rounded-xl font-extrabold disabled:opacity-60" style={{ background: GOLD, color: NAVY }}>{busy ? "Saving…" : "Save changes"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
