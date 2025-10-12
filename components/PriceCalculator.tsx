'use client'
import { useEffect, useMemo, useState } from "react";
import { detectClassFromModel } from "../data/vehicleClass";
import { computeQuote, type VehicleClass } from "../lib/pricing";
import Link from "next/link";


type FormState = {
  year: number | "";
  makes: string[];
  make: string;
  model: string;
  models: string[];
  vehicleClass: VehicleClass | "";
  loadingMakes: boolean;
  loadingModels: boolean;
  error?: string;
};

const YEARS = Array.from({ length: 25 }, (_, i) => new Date().getFullYear() - i);

export default function PriceCalculator() {
  const [f, setF] = useState<FormState>({
    year: "",
    makes: [],
    make: "",
    model: "",
    models: [],
    vehicleClass: "",
    loadingMakes: false,
    loadingModels: false,
  });

  // Load all makes (alphabetical) once
  useEffect(() => {
    async function loadMakes() {
      setF(prev => ({ ...prev, loadingMakes: true }));
      try {
        const r = await fetch("/api/makes");
        const data = await r.json();
        setF(prev => ({ ...prev, makes: data.makes ?? [], loadingMakes: false }));
      } catch {
        setF(prev => ({ ...prev, makes: [], loadingMakes: false, error: "Couldn't load makes." }));
      }
    }
    loadMakes();
  }, []);

  // Load models whenever make+year selected
  useEffect(() => {
    async function loadModels() {
      if (!f.make || !f.year) {
        setF(prev => ({ ...prev, models: [], model: "", vehicleClass: "" }));
        return;
      }
      setF(prev => ({ ...prev, loadingModels: true, models: [], model: "", vehicleClass: "", error: undefined }));
      try {
        const r = await fetch(`/api/models?make=${encodeURIComponent(f.make)}&year=${encodeURIComponent(String(f.year))}`);
        const data = await r.json();
        setF(prev => ({ ...prev, models: data.models ?? [], loadingModels: false }));
      } catch {
        setF(prev => ({ ...prev, models: [], loadingModels: false, error: "Couldn't load models." }));
      }
    }
    loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.make, f.year]);

  // When model changes, auto-detect class
  useEffect(() => {
    if (!f.model) return;
    setF(prev => ({ ...prev, vehicleClass: detectClassFromModel(f.model) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.model]);

  const quote = useMemo(() => {
    if (!f.make || !f.vehicleClass) return null;
    return computeQuote({ make: f.make, vehicleClass: f.vehicleClass });
  }, [f.make, f.vehicleClass]);

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setF(prev => ({ ...prev, [k]: v }));

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Inputs */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Vehicle</h2>
        <div className="grid grid-cols-2 gap-4">
          {/* Year */}
          <div>
            <label className="block text-sm font-medium text-slate-700">Year</label>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
              value={f.year}
              onChange={e=>update("year", e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">Select year</option>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {/* Make */}
          <div>
            <label className="block text-sm font-medium text-slate-700">Make</label>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
              value={f.make}
              onChange={e=>update("make", e.target.value)}
              disabled={f.loadingMakes || !f.makes.length}
            >
              <option value="">{f.loadingMakes ? "Loading makes…" : "Select make"}</option>
              {f.makes.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {/* Model */}
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700">Model</label>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
              value={f.model}
              onChange={e=>update("model", e.target.value)}
              disabled={!f.make || !f.year || f.loadingModels || !f.models.length}
            >
              <option value="">
                {!f.make || !f.year ? "Choose year & make first"
                 : f.loadingModels ? "Loading models…"
                 : f.models.length ? "Select model"
                 : "No models found"}
              </option>
              {f.models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            {f.vehicleClass && (
              <p className="text-xs text-slate-500 mt-2">Detected class: <strong>{f.vehicleClass}</strong></p>
            )}
          </div>
        </div>
      </div>

      {/* Quote */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Quote</h2>
        {!quote ? (
          <p className="text-slate-600">Pick year, make, and model to see your price.</p>
        ) : (
          <div className="space-y-2">
            <div className="text-slate-700">
              Vehicle: <strong>{f.year || "Year"} {f.make || "Make"} {f.model || "Model"}</strong>
            </div>
            <div className="text-slate-700">
              Class: <strong>{f.vehicleClass}</strong>
            </div>
            <hr className="my-2" />
            <div className="flex justify-between text-xl font-extrabold">
              <span>Total</span><span>${quote.base.toFixed(2)}</span>
            </div>
            <div className="pt-4">
              <Link
                href={`/request?price=${quote.base}&year=${f.year || ""}&make=${encodeURIComponent(
                  f.make
                )}&model=${encodeURIComponent(f.model)}&vclass=${encodeURIComponent(
                  f.vehicleClass || ""
                )}`}
                className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-brand text-white font-semibold hover:bg-brand-light w-full text-center"
              >
                Book this quote
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
