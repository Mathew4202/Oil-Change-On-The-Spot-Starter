"use client";
// Year / make / model drop-downs for HQ (same lists as the website). "Not listed" lets you type it.
import { useEffect, useMemo, useState } from "react";

const LINE = "#c8d0e0";
const cls = "h-12 rounded-xl border px-3 text-base w-full bg-white font-normal";
const lbl = "flex flex-col gap-1 text-sm font-semibold";
let makesCache: string[] | null = null;

export default function CarPicker({ year, make, model, onChange }: {
  year: string; make: string; model: string; onChange: (v: { year: string; make: string; model: string }) => void;
}) {
  const [makes, setMakes] = useState<string[]>(makesCache ?? []);
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [typeMake, setTypeMake] = useState(false); const [typeModel, setTypeModel] = useState(false);
  const years = useMemo(() => { const y = new Date().getFullYear() + 1; return Array.from({ length: y - 1984 }, (_, i) => String(y - i)); }, []);

  useEffect(() => {
    if (makesCache) return;
    fetch("/api/makes").then((r) => r.json()).then((d) => { makesCache = d.makes || []; setMakes(makesCache!); }).catch(() => {});
  }, []);
  // a make we don't list (e.g. typed before, or from an old record): show it as typed
  useEffect(() => { if (make && makes.length && !makes.some((m) => m.toLowerCase() === make.toLowerCase())) setTypeMake(true); }, [make, makes]);
  useEffect(() => {
    setModels([]); if (!year || !make || typeMake) return;
    setLoading(true);
    fetch(`/api/models?make=${encodeURIComponent(make)}&year=${year}`).then((r) => r.json()).then((d) => setModels(d.models || [])).catch(() => {}).finally(() => setLoading(false));
  }, [year, make, typeMake]);
  useEffect(() => { if (model && models.length && !models.some((m) => m.toLowerCase() === model.toLowerCase())) setTypeModel(true); }, [model, models]);

  const set = (p: Partial<{ year: string; make: string; model: string }>) => onChange({ year, make, model, ...p });
  return (
    <div className="grid grid-cols-3 gap-2">
      <label className={lbl}>Year
        <select value={year} onChange={(e) => set({ year: e.target.value, model: "" })} className={cls} style={{ borderColor: LINE }}>
          <option value="">Year</option>{years.map((y) => <option key={y}>{y}</option>)}
        </select>
      </label>
      <label className={`${lbl} col-span-2`}>Make
        {typeMake ? (
          <span className="flex gap-1"><input value={make} onChange={(e) => set({ make: e.target.value, model: "" })} placeholder="Type the make" className={cls} style={{ borderColor: LINE }} />
            <button type="button" onClick={() => { setTypeMake(false); set({ make: "", model: "" }); }} className="px-2 text-sm underline">List</button></span>
        ) : (
          <select value={make} onChange={(e) => (e.target.value === "__other" ? (setTypeMake(true), set({ make: "", model: "" })) : set({ make: e.target.value, model: "" }))} className={cls} style={{ borderColor: LINE }}>
            <option value="">Make</option>{makes.map((m) => <option key={m}>{m}</option>)}<option value="__other">Not listed, type it</option>
          </select>
        )}
      </label>
      <label className={`${lbl} col-span-3`}>Model
        {typeModel || typeMake ? (
          <span className="flex gap-1"><input value={model} onChange={(e) => set({ model: e.target.value })} placeholder="Type the model" className={cls} style={{ borderColor: LINE }} />
            {!typeMake && <button type="button" onClick={() => { setTypeModel(false); set({ model: "" }); }} className="px-2 text-sm underline">List</button>}</span>
        ) : (
          <select value={model} onChange={(e) => (e.target.value === "__other" ? (setTypeModel(true), set({ model: "" })) : set({ model: e.target.value }))} disabled={!year || !make}
            className={`${cls} disabled:bg-[#f5f7fb]`} style={{ borderColor: LINE }}>
            <option value="">{!year || !make ? "Pick the year and make first" : loading ? "Loading models…" : "Model"}</option>
            {models.map((m) => <option key={m}>{m}</option>)}{year && make && <option value="__other">Not listed, type it</option>}
          </select>
        )}
      </label>
    </div>
  );
}
