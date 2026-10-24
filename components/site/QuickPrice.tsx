"use client";
// "See your price in 10 seconds": pick year/make/model, then the booking page opens with the car filled in.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { NAVY, GOLD, LINE, MUTED } from "./brand";

export default function QuickPrice() {
  const router = useRouter();
  const [makes, setMakes] = useState<string[]>([]); const [models, setModels] = useState<string[]>([]);
  const [year, setYear] = useState(""); const [make, setMake] = useState(""); const [model, setModel] = useState("");
  const years = useMemo(() => { const y = new Date().getFullYear() + 1; return Array.from({ length: y - 1989 }, (_, i) => String(y - i)); }, []);
  useEffect(() => { fetch("/api/makes").then((r) => r.json()).then((d) => setMakes(d.makes || [])).catch(() => {}); }, []);
  useEffect(() => {
    setModels([]); setModel(""); if (!year || !make) return;
    fetch(`/api/models?make=${encodeURIComponent(make)}&year=${year}`).then((r) => r.json()).then((d) => setModels(d.models || [])).catch(() => {});
  }, [year, make]);
  function go(e: React.FormEvent) {
    e.preventDefault();
    const p = new URLSearchParams(); if (year) p.set("year", year); if (make) p.set("make", make); if (model) p.set("model", model);
    router.push(`/booking${p.toString() ? `?${p}` : ""}` as never);
  }
  const sel = "h-[52px] w-full rounded-xl border px-3 text-[17px] bg-white text-[#0d1b3e]";
  return (
    <form onSubmit={go} aria-label="Get your price" className="bg-white rounded-2xl p-4 sm:p-5 flex flex-col gap-3 shadow-xl text-[#0d1b3e]">
      <p className="font-bold text-[18px]">See your price in 10 seconds</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <label className="flex flex-col gap-1 text-sm font-semibold" style={{ color: MUTED }}>Year
          <select value={year} onChange={(e) => setYear(e.target.value)} className={sel} style={{ borderColor: LINE }}><option value="">Year</option>{years.map((y) => <option key={y}>{y}</option>)}</select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold" style={{ color: MUTED }}>Make
          <select value={make} onChange={(e) => setMake(e.target.value)} className={sel} style={{ borderColor: LINE }}><option value="">Make</option>{makes.map((m) => <option key={m}>{m}</option>)}</select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold" style={{ color: MUTED }}>Model
          <select value={model} onChange={(e) => setModel(e.target.value)} disabled={!models.length} className={`${sel} disabled:bg-[#f4f6fa]`} style={{ borderColor: LINE }}>
            <option value="">{year && make && !models.length ? "Loading…" : "Model"}</option>{models.map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
      </div>
      <button type="submit" className="h-[54px] rounded-xl text-[18px] font-extrabold" style={{ background: GOLD, color: NAVY }}>Get my price</button>
      <p className="text-sm" style={{ color: MUTED }}>No account needed. Oil changes start at $90 + HST.</p>
    </form>
  );
}
