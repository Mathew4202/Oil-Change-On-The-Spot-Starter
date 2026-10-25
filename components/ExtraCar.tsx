"use client";
// Another car on the same visit: its own year/make/model/engine and what it needs, priced on its own (travel is only charged once).
import { useEffect, useMemo, useState } from "react";

const NAVY = "#0d1b3e", LINE = "#c8d0e0";
const input = "h-[52px] rounded-xl border px-3 text-[17px] w-full bg-white text-[#0d1b3e]";
const labelCls = "flex flex-col gap-1.5 text-sm font-semibold text-[#4a5878]";

export type ExtraJob = "oil_change" | "seasonal" | "tires" | "rotation" | "diagnostic";
export type Extra = {
  key: string; year: string; make: string; model: string; engine: string; job: ExtraJob; tires: boolean; problem: string;
  quote: { subtotal: number; total: number; lines: { label: string; amount: number }[] } | null; engines: string[]; pricing: boolean;
};
export const newExtra = (): Extra => ({ key: Math.random().toString(36).slice(2), year: "", make: "", model: "", engine: "", job: "oil_change", tires: false, problem: "",
  quote: null, engines: [], pricing: false });
export const extraName = (e: Extra) => `${e.year} ${e.make} ${e.model}`.trim();
/** What still needs filling in (null = ready to book). */
export function extraMissing(e: Extra): string | null {
  if (!e.year || !e.make || !e.model) return "Pick the year, make and model of each car.";
  if (e.engines.length > 0 && !e.engine) return `Pick the engine for the ${extraName(e)}, or choose “Not sure”.`;
  if (e.job === "diagnostic" && e.problem.trim().length < 5) return `Tell us what's going on with the ${extraName(e)}.`;
  if (e.pricing || !e.quote) return "One moment, still working out the price.";
  return null;
}

export default function ExtraCar({ n, value, onPatch, onRemove, makes, jobs, date }: {
  n: number; value: Extra; onPatch: (p: Partial<Extra>) => void; onRemove: () => void; makes: string[];
  jobs: { id: string; name: string }[]; date: string;
}) {
  const e = value;
  const set = onPatch;   // the parent merges patches into the latest state, so typing never gets overwritten
  const [models, setModels] = useState<string[]>([]);
  const years = useMemo(() => { const y = new Date().getFullYear() + 1; return Array.from({ length: y - 1989 }, (_, i) => String(y - i)); }, []);
  const options = jobs.filter((j) => j.id !== "parts");

  useEffect(() => {
    setModels([]); if (!e.year || !e.make) return;
    fetch(`/api/models?make=${encodeURIComponent(e.make)}&year=${e.year}`).then((r) => r.json()).then((d) => setModels(d.models || [])).catch(() => {});
  }, [e.year, e.make]);

  useEffect(() => {
    if (!e.year || !e.make || !e.model) return;
    let live = true;
    const t = setTimeout(async () => {
      onPatch({ pricing: true });
      const p = new URLSearchParams({ year: e.year, make: e.make, model: e.model, job: e.job, date });
      if (e.engine && e.engine !== "unsure") p.set("engine", e.engine);
      if (e.job === "oil_change" && e.tires) p.set("addons", "tires");
      const j = await fetch(`/api/os/quote?${p}`).then((r) => r.json()).catch(() => null);
      if (!live) return;
      onPatch({ pricing: false, quote: j && !j.error ? { subtotal: j.subtotal, total: j.total, lines: j.lines } : null, engines: j?.engines ?? [] });
    }, 350);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e.year, e.make, e.model, e.engine, e.job, e.tires, date]);

  const chip = (on: boolean) => ({ background: on ? NAVY : "#fff", color: on ? "#fff" : NAVY, borderColor: on ? NAVY : LINE });
  return (
    <div className="rounded-2xl border-2 p-4 flex flex-col gap-3" style={{ borderColor: NAVY }}>
      <div className="flex items-center justify-between">
        <p className="font-bold text-[18px]">Car {n}</p>
        <button type="button" onClick={onRemove} className="text-sm underline font-semibold">Remove</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className={labelCls}>Year
          <select value={e.year} onChange={(x) => set({ year: x.target.value, model: "", engine: "", quote: null, engines: [] })} className={input} style={{ borderColor: LINE }}>
            <option value="">Year</option>{years.map((y) => <option key={y}>{y}</option>)}
          </select>
        </label>
        <label className={labelCls}>Make
          <select value={e.make} onChange={(x) => set({ make: x.target.value, model: "", engine: "", quote: null, engines: [] })} className={input} style={{ borderColor: LINE }}>
            <option value="">Make</option>{makes.map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
      </div>
      <label className={labelCls}>Model
        <select value={e.model} onChange={(x) => set({ model: x.target.value, engine: "", quote: null, engines: [] })} disabled={!models.length} className={`${input} disabled:bg-[#f5f7fb]`} style={{ borderColor: LINE }}>
          <option value="">{e.year && e.make && !models.length ? "Loading…" : "Model"}</option>{models.map((m) => <option key={m}>{m}</option>)}
        </select>
      </label>
      {e.engines.length > 0 && (
        <label className={labelCls}>Engine
          <select value={e.engine} onChange={(x) => set({ engine: x.target.value })} className={input} style={{ borderColor: LINE }}>
            <option value="">Choose engine</option>{e.engines.map((x) => <option key={x}>{x}</option>)}<option value="unsure">Not sure</option>
          </select>
        </label>
      )}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-[#4a5878]">What does it need?</span>
        <div className="flex flex-wrap gap-2">
          {options.map((j) => <button key={j.id} type="button" onClick={() => set({ job: j.id as ExtraJob, tires: j.id === "oil_change" ? e.tires : false })} aria-pressed={e.job === j.id}
            className="h-10 px-3 rounded-full border text-sm font-bold" style={chip(e.job === j.id)}>{j.name}</button>)}
        </div>
      </div>
      {e.job === "oil_change" && (
        <label className="flex items-center gap-2 text-[15px] font-semibold">
          <input type="checkbox" checked={e.tires} onChange={(x) => set({ tires: x.target.checked })} className="w-5 h-5" style={{ accentColor: NAVY }} /> Add a tire swap (tires on rims)
        </label>
      )}
      {e.job === "diagnostic" && (
        <label className={labelCls}>What&apos;s going on with this car?
          <textarea value={e.problem} onChange={(x) => set({ problem: x.target.value.slice(0, 500) })} rows={3} placeholder="Warning lights, sounds, when it happens" className="rounded-xl border p-3 text-base font-normal text-[#0d1b3e]" style={{ borderColor: LINE }} />
        </label>
      )}
      <p className="text-[15px] font-bold" aria-live="polite">
        {e.pricing ? "Working out the price…" : e.quote ? `$${e.quote.subtotal.toFixed(2)} + HST for this car` : e.model ? "" : ""}
      </p>
    </div>
  );
}
