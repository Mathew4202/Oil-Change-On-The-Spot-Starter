"use client";
import SpecCard from "@/components/SpecCard";
import EnginePicker from "@/components/EnginePicker";
// HQ phone booking: another car on the same visit (its own car, service and add-ons, priced on its own).
import CarPicker from "@/components/CarPicker";
import { ExtraPricer, extraName, type Extra, type ExtraJob } from "@/components/ExtraCar";

const NAVY = "#0d1b3e", LINE = "#c8d0e0";
const JOBS: [ExtraJob, string][] = [["oil_change", "Oil change"], ["seasonal", "Seasonal package"], ["tires", "Tire change"], ["rotation", "Tire rotation"], ["parts", "Parts only"], ["diagnostic", "Diagnostic"]];
const ADDONS: [string, string][] = [["tires", "Tire change"], ["wipers", "Wipers"], ["cabin_filter", "Cabin filter"], ["engine_filter", "Engine air filter"], ["battery", "Battery"], ["coolant", "Coolant top-up"], ["washer_fluid", "Washer fluid"]];

export default function HqExtraCar({ n, value: e, onPatch, onRemove, date }: { n: number; value: Extra; onPatch: (p: Partial<Extra>) => void; onRemove: () => void; date: string }) {
  const chip = (on: boolean) => ({ background: on ? NAVY : "#fff", color: on ? "#fff" : NAVY, borderColor: on ? NAVY : LINE });
  const addons = e.job === "oil_change" ? ADDONS : e.job === "seasonal" || e.job === "parts" ? ADDONS.filter(([k]) => k !== "tires") : [];
  return (
    <div className="rounded-xl border-2 p-3 flex flex-col gap-3" style={{ borderColor: NAVY }}>
      <ExtraPricer value={e} date={date} onPatch={onPatch} />
      <div className="flex justify-between items-center"><p className="font-extrabold">Car {n}{extraName(e) ? ` · ${extraName(e)}` : ""}</p><button type="button" onClick={onRemove} className="text-sm underline font-semibold">Remove</button></div>
      <CarPicker year={e.year} make={e.make} model={e.model} onChange={(c) => onPatch({ ...c, engine: "", quote: null, engines: [] })} />
      <EnginePicker year={e.year} make={e.make} model={e.model} value={e.engine} onChange={(x) => onPatch({ engine: x })} />
      <div className="grid grid-cols-3 gap-2">{JOBS.map(([k, nm]) => <button key={k} type="button" onClick={() => onPatch({ job: k, addons: k === "oil_change" ? e.addons : e.addons.filter((a) => a !== "tires") })} className="h-10 rounded-lg border text-[13px] font-bold" style={chip(e.job === k)}>{nm}</button>)}</div>
      {addons.length > 0 && (
        <div className="flex flex-wrap gap-2">{addons.map(([k, nm]) => { const on = e.addons.includes(k); return <button key={k} type="button" onClick={() => onPatch({ addons: on ? e.addons.filter((a) => a !== k) : [...e.addons, k] })} className="h-9 px-3 rounded-full border text-sm font-bold" style={chip(on)}>{nm}</button>; })}</div>
      )}
      {e.job === "diagnostic" && <input value={e.problem} onChange={(x) => onPatch({ problem: x.target.value })} placeholder="What's wrong with it?" className="h-11 rounded-xl border px-3" style={{ borderColor: LINE }} />}
      {e.quote?.spec && (e.job === "oil_change" || e.job === "seasonal") && <SpecCard spec={e.quote.spec} engine={e.engine && e.engine !== "unsure" ? e.engine : null} />}
      <p className="text-sm font-bold">{e.pricing ? "Working out the price…" : e.quote ? `$${e.quote.subtotal.toFixed(2)} + HST for this car` : ""}</p>
    </div>
  );
}
