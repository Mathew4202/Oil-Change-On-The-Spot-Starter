"use client";
// More cars on the same visit. Each car is picked on the car step and gets the same full service choice on the services step
// (any service, add-ons, own oil). Each is priced on its own; travel is only charged once for the visit.
import { useEffect, useMemo, useState } from "react";
import VinSnap from "@/components/VinSnap";
import { matchEngine } from "@/lib/os/vin";

const NAVY = "#0d1b3e", LINE = "#c8d0e0", GOLD = "#f2b01e";
const input = "h-[52px] rounded-xl border px-3 text-[17px] w-full bg-white text-[#0d1b3e]";
const labelCls = "flex flex-col gap-1.5 text-sm font-semibold text-[#4a5878]";

export type ExtraJob = "oil_change" | "seasonal" | "tires" | "rotation" | "parts" | "diagnostic";
export type Extra = {
  key: string; year: string; make: string; model: string; engine: string; vin?: string; job: ExtraJob; addons: string[]; own: "" | "both" | "oil" | "filter"; problem: string;
  quote: { subtotal: number; total: number; lines: { label: string; amount: number }[]; spec?: import("@/components/SpecCard").HqSpec | null } | null; engines: string[]; pricing: boolean;
};
export const newExtra = (): Extra => ({ key: Math.random().toString(36).slice(2), year: "", make: "", model: "", engine: "", job: "oil_change", addons: [], own: "", problem: "",
  quote: null, engines: [], pricing: false });
export const extraName = (e: Extra) => `${e.year} ${e.make} ${e.model}`.trim();
const PARTS_ONLY = ["wipers", "cabin_filter", "engine_filter", "battery", "coolant", "washer_fluid"];
/** The add-ons that make sense for the service picked (tire swap only rides along with an oil change). */
export const extraAddons = (e: Pick<Extra, "job" | "addons">) => e.job === "oil_change" ? e.addons : e.job === "seasonal" || e.job === "parts" ? e.addons.filter((a) => a !== "tires") : [];

/** Car step: what's still missing (null = fine). */
export function extraCarMissing(e: Extra): string | null {
  if (!e.year || !e.make || !e.model) return "Pick the year, make and model of each car, or remove the extra car.";
  if (e.engines.length > 0 && !e.engine) return `Pick the engine for the ${extraName(e)}, or choose “Not sure”.`;
  return null;
}
/** Services step: what's still missing (null = ready to book). */
export function extraMissing(e: Extra): string | null {
  const c = extraCarMissing(e); if (c) return c;
  if (e.job === "parts" && !e.addons.some((a) => PARTS_ONLY.includes(a))) return `Pick what we're doing on the ${extraName(e)}.`;
  if (e.job === "diagnostic" && e.problem.trim().length < 5) return `Tell us what's going on with the ${extraName(e)}.`;
  if (e.pricing || !e.quote) return "One moment, still working out the price.";
  return null;
}

/** Keeps each extra car's price up to date, whichever step is showing. Renders nothing. */
export function ExtraPricer({ value: e, onPatch, date }: { value: Extra; onPatch: (p: Partial<Extra>) => void; date: string }) {
  useEffect(() => {
    if (!e.year || !e.make || !e.model) return;
    let live = true;
    const t = setTimeout(async () => {
      onPatch({ pricing: true });
      const p = new URLSearchParams({ year: e.year, make: e.make, model: e.model, job: e.job, date });
      if (e.engine && e.engine !== "unsure") p.set("engine", e.engine);
      const add = extraAddons(e); if (add.length) p.set("addons", add.join(","));
      if ((e.job === "oil_change" || e.job === "seasonal") && e.own) p.set("own", e.own);
      const j = await fetch(`/api/os/quote?${p}`).then((r) => r.json()).catch(() => null);
      if (!live) return;
      onPatch({ pricing: false, quote: j && !j.error ? { subtotal: j.subtotal, total: j.total, lines: j.lines, spec: j.spec ?? null } : null });
    }, 350);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e.year, e.make, e.model, e.engine, e.job, e.addons.join(","), e.own, date]);
  return null;
}

/** Car step: year / make / model / engine for car N. */
export function ExtraCarFields({ n, value: e, onPatch, onRemove, makes }: { n: number; value: Extra; onPatch: (p: Partial<Extra>) => void; onRemove: () => void; makes: string[] }) {
  const set = onPatch;
  const [models, setModels] = useState<string[]>([]);
  const years = useMemo(() => { const y = new Date().getFullYear() + 1; return Array.from({ length: y - 1989 }, (_, i) => String(y - i)); }, []);
  // every engine this car came with, looked up as soon as the model is picked
  const [lookingUp, setLookingUp] = useState(false);
  useEffect(() => {
    if (!e.year || !e.make || !e.model) return;
    let live = true; setLookingUp(true);
    fetch(`/api/os/engines?${new URLSearchParams({ year: e.year, make: e.make, model: e.model })}`).then((r) => r.json()).catch(() => ({ engines: [] }))
      .then((d) => { if (!live) return; setLookingUp(false); set({ engines: d.engines || [] }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e.year, e.make, e.model]);
  useEffect(() => {
    setModels([]); if (!e.year || !e.make) return;
    fetch(`/api/models?make=${encodeURIComponent(e.make)}&year=${e.year}`).then((r) => r.json()).then((d) => setModels(d.models || [])).catch(() => {});
  }, [e.year, e.make]);
  // a snapped or typed VIN fills the car: year and make now, the model once its list loads, the engine once its list loads
  const [vinModel, setVinModel] = useState(""); const [vinEngine, setVinEngine] = useState("");
  useEffect(() => {
    if (!vinModel || !models.length) return;
    const v = vinModel.toLowerCase().replace(/[^a-z0-9]/g, "");
    const k = (m: string) => m.toLowerCase().replace(/[^a-z0-9]/g, "");
    const hit = models.find((m) => k(m) === v) ?? models.find((m) => k(m).startsWith(v) || v.startsWith(k(m)));
    if (hit) set({ model: hit, engine: "", quote: null, engines: [] });
    setVinModel("");
  }, [models, vinModel]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!vinEngine || lookingUp || !e.engines.length) return;
    const hit = matchEngine(vinEngine, e.engines);
    if (hit) set({ engine: hit });
    setVinEngine("");
  }, [e.engines, lookingUp, vinEngine]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="rounded-2xl border-2 p-4 flex flex-col gap-3" style={{ borderColor: NAVY }}>
      <div className="flex items-center justify-between">
        <p className="font-bold text-[18px]">Car {n}</p>
        <button type="button" onClick={onRemove} className="text-sm underline font-semibold">Remove</button>
      </div>
      <VinSnap vin={e.vin ?? ""} onVin={(v) => set({ vin: v })} onDecoded={(d, v) => {
        const mk = makes.find((m) => m.toLowerCase() === (d.make || "").toLowerCase()) ?? d.make ?? e.make;
        set({ vin: v, ...(d.year ? { year: String(d.year) } : {}), make: mk, model: "", engine: "", quote: null, engines: [] });
        setVinModel(d.model || ""); setVinEngine(d.engineL || "");
      }} />
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
      {lookingUp && e.model && (
        <label className={labelCls}>Engine<select disabled className={`${input} bg-[#f5f7fb]`} style={{ borderColor: LINE }}><option>Looking up engines…</option></select></label>
      )}
      {!lookingUp && e.engines.length > 0 && (
        <label className={labelCls}>Engine
          <select value={e.engine} onChange={(x) => set({ engine: x.target.value })} className={input} style={{ borderColor: LINE }}>
            <option value="">Choose engine</option>{e.engines.map((x) => <option key={x}>{x}</option>)}<option value="unsure">Not sure</option>
          </select>
        </label>
      )}
    </div>
  );
}

/** Services step: everything car 1 gets, for car N. */
export function ExtraCarServices({ n, value: e, onPatch, jobs, addonNames, addonNotes, season }: {
  n: number; value: Extra; onPatch: (p: Partial<Extra>) => void; jobs: { id: string; name: string; note: string }[];
  addonNames: Record<string, string>; addonNotes: Record<string, string>; season: boolean;
}) {
  const set = onPatch;
  const list = e.job === "parts" ? PARTS_ONLY : e.job === "oil_change" ? ["tires", ...PARTS_ONLY] : e.job === "seasonal" ? PARTS_ONLY : [];
  const card = (on: boolean) => ({ borderColor: on ? NAVY : LINE, borderWidth: on ? 2 : 1, background: on ? "#fff6dd" : "#fff" });
  const price = (re: RegExp) => e.quote?.lines.find((l) => re.test(l.label))?.amount;
  return (
    <section className="flex flex-col gap-2.5 pt-2">
      <div className="flex items-baseline justify-between gap-2 border-t-2 pt-4" style={{ borderColor: GOLD }}>
        <h2 className="text-[20px] font-bold">Car {n} · {extraName(e)}</h2>
        <span className="text-[15px] font-bold whitespace-nowrap" aria-live="polite">{e.pricing ? "…" : e.quote ? `$${e.quote.subtotal.toFixed(2)}` : ""}</span>
      </div>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label={`Service for car ${n}`}>
        {jobs.map((j) => (
          <button key={j.id} type="button" role="radio" aria-checked={e.job === j.id} onClick={() => set({ job: j.id as ExtraJob, addons: j.id === "oil_change" ? e.addons : e.addons.filter((a) => a !== "tires") })}
            className="rounded-xl p-3 flex flex-col gap-0.5 text-left border" style={card(e.job === j.id)}>
            <span className="font-bold text-[16px]">{j.name}</span><span className="text-sm text-[#4a5878]">{j.note}</span>
          </button>
        ))}
      </div>
      {list.length > 0 && (
        <>
          <p className="text-[15px] font-bold text-[#4a5878]">{e.job === "parts" ? "What should we do? ($50 visit + parts)" : "Add while we're there"}</p>
          <div className="flex flex-col gap-2">
            {list.map((id) => {
              const on = e.addons.includes(id);
              const p = on ? price(id === "tires" ? /^Tire change/ : new RegExp(`^${(addonNames[id] ?? id).split(" ")[0]}`, "i")) : undefined;
              return (
                <button key={id} type="button" aria-pressed={on} onClick={() => set({ addons: on ? e.addons.filter((x) => x !== id) : [...e.addons, id] })}
                  className="min-h-14 w-full rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3 text-left border" style={card(on)}>
                  <span className="flex flex-col gap-0.5"><span className="font-bold text-base">{addonNames[id] ?? id}</span>
                    <span className="text-sm text-[#4a5878]">{id === "tires" ? (season ? "Tires on rims, $15 off with the oil change" : "Tires on rims, $10 off with the oil change") : addonNotes[id]}</span></span>
                  <span className="font-bold text-base whitespace-nowrap">{on ? (p != null ? `$${p}` : "Added") : "Add"}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
      {(e.job === "oil_change" || e.job === "seasonal") && (
        <details className="rounded-xl border border-[#c8d0e0] p-3" open={!!e.own}>
          <summary className="font-semibold text-[15px] cursor-pointer">Bringing your own oil or filter for this car?</summary>
          <div className="flex flex-wrap gap-2 mt-3">
            {([["", "No"], ["both", "Oil + filter"], ["oil", "Oil only"], ["filter", "Filter only"]] as const).map(([k, nm]) => (
              <button key={k} type="button" onClick={() => set({ own: k })} className="h-10 px-3 rounded-full border text-sm font-bold" style={{ background: e.own === k ? NAVY : "#fff", color: e.own === k ? "#fff" : NAVY, borderColor: e.own === k ? NAVY : LINE }}>{nm}</button>
            ))}
          </div>
        </details>
      )}
      {e.job === "diagnostic" && (
        <label className={labelCls}>What&apos;s going on with this car?
          <textarea value={e.problem} onChange={(x) => set({ problem: x.target.value.slice(0, 500) })} rows={3} placeholder="Warning lights, sounds, when it happens" className="rounded-xl border p-3 text-base font-normal text-[#0d1b3e]" style={{ borderColor: LINE }} />
        </label>
      )}
    </section>
  );
}
