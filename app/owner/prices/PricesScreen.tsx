"use client";
import { useEffect, useState } from "react";

type Field = { key: string; label: string; group: string; def: number; value: number };
const NAVY = "#0d1b3e", MUTED = "#4a5878", GOLD = "#f2b01e";

export default function PricesScreen() {
  const [fields, setFields] = useState<Field[] | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [err, setErr] = useState(""); const [note, setNote] = useState(""); const [busy, setBusy] = useState(false);

  const load = async () => {
    const r = await fetch("/api/owner/prices");
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error || "Couldn't load prices"); return; }
    setFields(j.fields); setVals(Object.fromEntries(j.fields.map((f: Field) => [f.key, String(f.value)])));
  };
  useEffect(() => { load(); }, []);

  const save = async (values: Record<string, number | null>) => {
    setBusy(true); setErr(""); setNote("");
    const r = await fetch("/api/owner/prices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok || !j.ok) { setErr(j.error || "Couldn't save"); return; }
    setNote("Prices saved. New quotes and bookings use them; existing bookings keep their price."); setFields(j.fields);
    setVals(Object.fromEntries(j.fields.map((f: Field) => [f.key, String(f.value)])));
  };

  const changed = fields ? fields.filter((f) => vals[f.key] !== undefined && Number(vals[f.key]) !== f.value) : [];
  const groups = fields ? [...new Set(fields.map((f) => f.group))] : [];

  return (
    <main className="min-h-screen p-4 flex flex-col gap-4 pb-28" style={{ background: "#f4f6fa" }}>
      <header>
        <h1 className="text-3xl font-extrabold" style={{ fontFamily: "var(--font-condensed)", color: NAVY }}>Prices</h1>
        <p className="text-sm" style={{ color: MUTED }}>Change a service price here. Prices are before HST. Leave a price as it was and it stays the same.</p>
      </header>
      {err && <p className="rounded-xl p-3 bg-[#fde8e8] text-[#9b1c1c] font-semibold">{err}</p>}
      {note && <p className="rounded-xl p-3 bg-[#e6f4ea] text-[#1d6b3a] font-semibold" role="status">{note}</p>}
      {!fields && !err && <p className="text-center py-8" style={{ color: MUTED }}>Loading…</p>}
      {fields && groups.map((g) => (
        <section key={g} className="bg-white rounded-2xl p-4 flex flex-col gap-3">
          <p className="font-extrabold text-lg" style={{ color: NAVY }}>{g}</p>
          {fields.filter((f) => f.group === g).map((f) => {
            const isDefault = Number(vals[f.key]) === f.def && f.value === f.def;
            return (
              <div key={f.key} className="flex items-center justify-between gap-3 flex-wrap">
                <label className="text-sm font-semibold flex-1 min-w-[160px]" htmlFor={f.key}>{f.label}
                  <span className="block text-xs font-normal" style={{ color: MUTED }}>Default ${f.def.toFixed(2)}</span></label>
                <div className="flex items-center gap-2">
                  <span className="font-bold">$</span>
                  <input id={f.key} inputMode="decimal" value={vals[f.key] ?? ""} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value.replace(/[^\d.]/g, "") })}
                    className="h-11 w-24 rounded-lg border border-[#c8d0e0] px-2 text-base text-right" />
                  {!isDefault && <button disabled={busy} onClick={() => save({ [f.key]: null })} className="h-11 px-2 rounded-lg border border-[#c8d0e0] text-xs font-bold">Reset</button>}
                </div>
              </div>
            );
          })}
        </section>
      ))}
      {fields && (
        <button disabled={busy || changed.length === 0} onClick={() => save(Object.fromEntries(changed.map((f) => [f.key, Number(vals[f.key])])))}
          className="h-14 rounded-xl font-extrabold disabled:opacity-50" style={{ background: GOLD, color: NAVY }}>
          {busy ? "Saving…" : changed.length ? `Save ${changed.length} price${changed.length === 1 ? "" : "s"}` : "No changes"}
        </button>
      )}
    </main>
  );
}
