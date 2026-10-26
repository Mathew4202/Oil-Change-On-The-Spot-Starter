"use client";
// HQ engine dropdown: looks up the engines for the car picked (same as the customer side) and shows
// "Looking up engines…" while it does. One engine: picked for you. None found: type it.
import { useEffect, useState } from "react";

const LINE = "#c8d0e0";
const cls = "h-12 rounded-xl border px-3 text-[16px] w-full bg-white text-[#0d1b3e]";

export default function EnginePicker({ year, make, model, value, onChange, label = "Engine" }: {
  year: string; make: string; model: string; value: string; onChange: (v: string) => void; label?: string;
}) {
  const [engines, setEngines] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState(false);
  const ready = /^\d{4}$/.test(year) && !!make.trim() && !!model.trim();

  useEffect(() => {
    setEngines(null); setTyping(false);
    if (!ready) return;
    let live = true;
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/os/engines?${new URLSearchParams({ year, make: make.trim(), model: model.trim() })}`, { cache: "no-store" })
        .then((r) => r.json()).catch(() => ({ engines: [] }))
        .then((d) => {
          if (!live) return;
          const list: string[] = d.engines || [];
          setEngines(list); setLoading(false);
          if (list.length === 1 && !value) onChange(list[0]);
          if (value && value !== "unsure" && list.length && !list.includes(value)) {
            // "2.0L" from a VIN or an old record → the list's "2.0L 4-cyl" when only one engine that size fits
            const size = value.match(/\d\.\d/)?.[0];
            const same = size ? list.filter((e) => e.includes(size) && /hybrid/i.test(e) === /hybrid/i.test(value)) : [];
            if (same.length === 1) onChange(same[0]); else setTyping(true);
          }
        });
    }, 250);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, make, model, ready]);

  if (!ready) return null;
  const lbl = "flex flex-col gap-1.5 text-sm font-semibold text-[#4a5878]";
  if (loading || engines == null) return <label className={lbl}>{label}<select disabled className={`${cls} bg-[#f5f7fb]`} style={{ borderColor: LINE }}><option>Looking up engines…</option></select></label>;
  if (!engines.length || typing) return (
    <label className={lbl}>{label}{!engines.length ? " (couldn't find the engines, type it if you know it)" : ""}
      <div className="flex gap-2">
        <input value={value === "unsure" ? "" : value} onChange={(e) => onChange(e.target.value)} placeholder="e.g. 2.0L" className={cls} style={{ borderColor: LINE }} />
        {engines.length > 0 && <button type="button" onClick={() => { setTyping(false); onChange(""); }} className="h-12 px-3 rounded-xl border text-sm font-bold bg-white" style={{ borderColor: LINE }}>List</button>}
      </div>
    </label>
  );
  return (
    <label className={lbl}>{label}
      <select value={engines.includes(value) || value === "unsure" ? value : ""} onChange={(e) => (e.target.value === "__type" ? (setTyping(true), onChange("")) : onChange(e.target.value))} className={cls} style={{ borderColor: LINE }}>
        <option value="">Choose engine</option>
        {engines.map((e) => <option key={e} value={e}>{e}</option>)}
        <option value="unsure">Not sure</option>
        <option value="__type">Other (type it)</option>
      </select>
    </label>
  );
}
