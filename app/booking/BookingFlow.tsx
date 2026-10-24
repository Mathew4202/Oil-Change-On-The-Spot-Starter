"use client";
// Customer booking: car → services → time → details → confirm. Prices and times come from OCOTS OS.
import { useEffect, useMemo, useState } from "react";

const NAVY = "#0d1b3e", GOLD = "#f2b01e", LINE = "#c8d0e0";
type JobId = "oil_change" | "seasonal" | "tires" | "parts" | "diagnostic";
type Line = { label: string; amount: number };
type Quote = { lines: Line[]; subtotal: number; hst: number; total: number; engines?: string[];
  spec: { engine?: string | null; grade: string; capacityL: number } | null; vehicle?: { class: string }; error?: string };
type Slot = { time: string; label: string; start: string };
type Services = { season: string | null; jobs: { id: JobId; name: string; note: string }[]; addons: { id: string; name: string }[] };

type SavedCar = { year: string; make: string; model: string; engine: string };
type Saved = { name: string; phone: string; email: string; address: string; cars: SavedCar[] };
const SAVE_KEY = "ocots_saved_v1";
function readSaved(): Saved | null { try { const v = localStorage.getItem(SAVE_KEY); return v ? JSON.parse(v) : null; } catch { return null; } }
function writeSaved(v: Saved | null) { try { if (v) localStorage.setItem(SAVE_KEY, JSON.stringify(v)); else localStorage.removeItem(SAVE_KEY); } catch { /* private mode: skip */ } }

const STEPS = ["Your car", "Services", "Date and time", "Your details", "Review", "Done"];
const ADDON_NOTES: Record<string, string> = {
  tires: "Tires already on rims", wipers: "$15 labour + blades", cabin_filter: "$10 labour + filter",
  engine_filter: "$10 labour + filter", battery: "$20 install + battery", coolant: "Top-up with the right type",
  washer_fluid: "Top-up",
};
const PARTS_ONLY = ["wipers", "cabin_filter", "engine_filter", "battery", "coolant", "washer_fluid"];
const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`;
const short = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n) % 1 ? Math.abs(n).toFixed(2) : Math.abs(n)}`;
const TZ = "America/Halifax";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const addDays = (d: string, n: number) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
const dayParts = (d: string) => { const [y, m, dd] = d.split("-").map(Number); const x = new Date(Date.UTC(y, m - 1, dd, 12));
  return { dow: x.toLocaleDateString("en-CA", { timeZone: "UTC", weekday: "short" }), num: dd, mon: x.toLocaleDateString("en-CA", { timeZone: "UTC", month: "short" }),
    long: x.toLocaleDateString("en-CA", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }) }; };

const input = "h-[52px] rounded-xl border px-3 text-[17px] w-full bg-white text-[#0d1b3e] outline-none focus:border-[#0d1b3e] focus:border-2";
const labelCls = "flex flex-col gap-1.5 text-sm font-semibold text-[#4a5878]";

export default function BookingFlow() {
  const [step, setStep] = useState(0);
  // car
  const [year, setYear] = useState(""); const [make, setMake] = useState(""); const [model, setModel] = useState(""); const [engine, setEngine] = useState("");
  const [makes, setMakes] = useState<string[]>([]); const [models, setModels] = useState<string[]>([]);
  // services
  const [services, setServices] = useState<Services | null>(null);
  const [job, setJob] = useState<JobId>("oil_change");
  const [addons, setAddons] = useState<string[]>([]);
  const [own, setOwn] = useState<"" | "both" | "oil" | "filter">("");
  // time
  const [date, setDate] = useState(today());
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [dayNote, setDayNote] = useState("");
  // details
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [email, setEmail] = useState("");
  const [address, setAddress] = useState(""); const [notes, setNotes] = useState("");
  // price + submit
  const [quote, setQuote] = useState<Quote | null>(null);
  const [pricing, setPricing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ when: string; date: string; total: number } | null>(null);
  // "Save my info on this phone" (optional). Text-code accounts come with texting.
  const [saved, setSaved] = useState<Saved | null>(null);
  const [saveState, setSaveState] = useState<"ask" | "saved" | "declined">("ask");
  const [manualEngine, setManualEngine] = useState("");

  const years = useMemo(() => { const y = new Date().getFullYear() + 1; return Array.from({ length: y - 1989 }, (_, i) => String(y - i)); }, []);
  useEffect(() => { fetch("/api/makes").then((r) => r.json()).then((d) => setMakes(d.makes || [])).catch(() => {}); }, []);
  // Returning customer on this phone: fill in their details
  useEffect(() => {
    const v = readSaved(); if (!v) return;
    setSaved(v); setName(v.name); setPhone(v.phone); setEmail(v.email || ""); setAddress(v.address);
  }, []);
  function pickSavedCar(c: SavedCar) { setYear(c.year); setMake(c.make); setModel(c.model); setEngine(c.engine || ""); }
  function saveHere() {
    const car: SavedCar = { year, make, model, engine: engine === "unsure" ? "" : engine };
    const others = (saved?.cars ?? []).filter((c) => !(c.year === car.year && c.make === car.make && c.model === car.model));
    const v: Saved = { name: name.trim(), phone: phone.trim(), email: email.trim(), address: address.trim(), cars: [car, ...others].slice(0, 5) };
    writeSaved(v); setSaved(v); setSaveState("saved");
  }
  function forget() { writeSaved(null); setSaved(null); setName(""); setPhone(""); setEmail(""); setAddress(""); }
  useEffect(() => {
    setModels([]); if (!make || !year) return;
    fetch(`/api/models?make=${encodeURIComponent(make)}&year=${year}`).then((r) => r.json()).then((d) => setModels(d.models || [])).catch(() => {});
  }, [make, year]);
  useEffect(() => { fetch(`/api/os/services?date=${date}`).then((r) => r.json()).then(setServices).catch(() => {}); }, [date]);

  // Price (re-check whenever anything that affects it changes)
  const carReady = !!(year && make && model);
  useEffect(() => {
    if (!carReady) { setQuote(null); return; }
    const t = setTimeout(async () => {
      setPricing(true);
      const p = new URLSearchParams({ year, make, model, job, date });
      if (engine && engine !== "unsure") p.set("engine", engine);   // "Not sure" prices the safest engine, no extra lookup
      const sent = job === "oil_change" ? addons : job === "seasonal" || job === "parts" ? addons.filter((a) => a !== "tires") : [];
      if (sent.length) p.set("addons", sent.join(","));
      if ((job === "oil_change" || job === "seasonal") && own) p.set("own", own);
      try { const r = await fetch(`/api/os/quote?${p}`); setQuote(await r.json()); } catch { setQuote(null); }
      setPricing(false);
    }, 350);
    return () => clearTimeout(t);
  }, [carReady, year, make, model, engine, job, addons, own, date]);

  // Open times
  useEffect(() => {
    if (step !== 2) return;
    setSlots(null); setSlot(null); setDayNote("");
    const tires = job === "oil_change" && addons.includes("tires") ? "tires" : "";
    fetch(`/api/os/slots?date=${date}&job=${job}&addons=${tires}`).then((r) => r.json())
      .then((d) => { setSlots(d.slots || []); if (!d.open) setDayNote(d.reason || "No open times this day"); })
      .catch(() => setSlots([]));
  }, [step, date, job, addons]);

  // Days to show: next 30, and only in-season days for the seasonal package
  const days = useMemo(() => Array.from({ length: 30 }, (_, i) => addDays(today(), i)), []);

  const jobsShown = services?.jobs ?? [{ id: "oil_change" as JobId, name: "Oil change", note: "" }];
  const addonList = job === "parts" ? PARTS_ONLY : job === "oil_change" ? ["tires", ...PARTS_ONLY] : job === "seasonal" ? PARTS_ONLY : [];

  function next() {
    setErr("");
    if (step === 0 && !carReady) return setErr("Pick your car's year, make and model.");
    if (step === 0 && quote?.engines && quote.engines.length > 0 && !engine) return setErr("Pick your engine, or choose “Not sure”.");
    if (step === 1 && job === "parts" && !addons.some((a) => PARTS_ONLY.includes(a))) return setErr("Pick at least one thing for us to do.");
    if (step === 2 && !slot) return setErr("Pick a time.");
    if (step === 3) {
      if (!name.trim()) return setErr("Add your name.");
      if (phone.replace(/\D/g, "").length < 10) return setErr("Add a 10-digit mobile number so we can text you.");
      if (address.trim().length < 5) return setErr("Add the address where your car will be.");
    }
    if (step === 4) return book();
    setStep((s) => s + 1);
    window.scrollTo({ top: 0 });
  }

  async function book() {
    if (!slot) return;
    setBusy(true);
    const [first, ...rest] = name.trim().split(/\s+/);
    const r = await fetch("/api/os/book", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: first, lastName: rest.join(" "), phone, email: email.trim(), address: address.trim(),
        car: { year: Number(year), make, model, ...(engine && engine !== "unsure" ? { engine } : {}) },
        job, addons: job === "oil_change" ? addons : job === "seasonal" || job === "parts" ? addons.filter((a) => a !== "tires") : [],
        own: (job === "oil_change" || job === "seasonal") && own ? own : null,
        start: slot.start, payMode: "after", notes: notes.trim() || undefined,
      }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.status === 409) { setErr(j.error || "That time was just taken. Please pick another."); setStep(2); setSlot(null); return; }
    if (!r.ok) return setErr(j.error || "Something went wrong. Please call or text 782-640-8341.");
    setDone({ when: j.when, date: j.date, total: j.total });
    setStep(5);
  }

  const card = (on: boolean) => ({ borderColor: on ? NAVY : LINE, borderWidth: on ? 2 : 1, background: on ? "#fff6dd" : "#fff" });
  const pickStyle = (on: boolean) => ({ borderColor: on ? NAVY : LINE, borderWidth: on ? 2 : 1, background: on ? GOLD : "#fff" });
  const nextLabel = ["See services", "Pick a time", "Continue", "Review", busy ? "Booking…" : "Book it"][step];
  const jobLine = quote?.lines?.[0];

  return (
    <div className="min-h-dvh bg-[#eef1f6] flex justify-center">
      <div className="w-full max-w-md min-h-dvh bg-white flex flex-col text-[#0d1b3e] shadow-sm">
        {/* Header */}
        <header className="sticky top-0 z-10 text-white px-5 pt-[max(16px,env(safe-area-inset-top))] pb-4 flex flex-col gap-3" style={{ background: NAVY }}>
          <div className="flex items-center gap-3">
            {step > 0 && step < 5 ? (
              <button onClick={() => { setErr(""); setStep((s) => s - 1); }} aria-label="Back" className="w-11 h-11 rounded-lg border border-[#3b4d7a] flex items-center justify-center">
                <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
            ) : (
              <a href="/" aria-label="Oil Change On The Spot home" className="w-11 h-11 rounded-lg overflow-hidden bg-white/10 flex items-center justify-center">
                <img src="/apple-touch-icon.png" alt="" className="w-9 h-9 object-contain" />
              </a>
            )}
            <p className="flex-1 text-[22px] font-extrabold tracking-wide" style={{ fontFamily: "var(--font-condensed)" }}>{STEPS[step]}</p>
            {step < 5 && <p className="text-sm text-[#c9d3ea] font-semibold">Step {step + 1} of 5</p>}
          </div>
          <div className="h-1.5 bg-[#22356a] rounded-full overflow-hidden"><div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.round(((step + 1) / 6) * 100)}%`, background: GOLD }} /></div>
        </header>

        <main className="flex-1 p-5 flex flex-col gap-4 pb-36">
          {/* 0. Car */}
          {step === 0 && (
            <>
              {saved && (
                <div className="rounded-2xl border-2 p-4 flex flex-col gap-3" style={{ borderColor: NAVY, background: "#fff6dd" }}>
                  <p className="font-bold text-[17px]">Welcome back, {saved.name.split(" ")[0]}.</p>
                  <div className="flex flex-wrap gap-2">
                    {saved.cars.map((c) => {
                      const on = c.year === year && c.make === make && c.model === model;
                      return <button key={`${c.year}${c.make}${c.model}`} onClick={() => pickSavedCar(c)} aria-pressed={on}
                        className="h-11 px-4 rounded-full border-2 font-bold text-[15px]" style={{ borderColor: NAVY, background: on ? NAVY : "#fff", color: on ? "#fff" : NAVY }}>{c.year} {c.make} {c.model}</button>;
                    })}
                  </div>
                  <p className="text-sm text-[#4a5878]">Tap your car, or pick a different one below. Not {saved.name.split(" ")[0]}? <button onClick={forget} className="underline font-semibold">Clear saved info</button></p>
                </div>
              )}
              <h1 className="text-[22px] font-bold">Which car is it?</h1>
              <label className={labelCls}>Year
                <select value={year} onChange={(e) => { setYear(e.target.value); setModel(""); setEngine(""); setManualEngine(""); }} className={input} style={{ borderColor: LINE }}>
                  <option value="">Choose year</option>{years.map((y) => <option key={y}>{y}</option>)}
                </select>
              </label>
              <label className={labelCls}>Make
                <select value={make} onChange={(e) => { setMake(e.target.value); setModel(""); setEngine(""); setManualEngine(""); }} className={input} style={{ borderColor: LINE }}>
                  <option value="">Choose make</option>{makes.map((m) => <option key={m}>{m}</option>)}
                </select>
              </label>
              <label className={labelCls}>Model
                <select value={model} onChange={(e) => { setModel(e.target.value); setEngine(""); setManualEngine(""); }} disabled={!models.length} className={`${input} disabled:bg-[#f5f7fb]`} style={{ borderColor: LINE }}>
                  <option value="">{!year || !make ? "Pick year and make first" : models.length ? "Choose model" : "Loading models…"}</option>
                  {models.map((m) => <option key={m}>{m}</option>)}
                </select>
              </label>
              {carReady && (
                <label className={labelCls}>Engine
                  {quote?.engines && quote.engines.length > 0 ? (
                    <select value={engine} onChange={(e) => setEngine(e.target.value)} className={input} style={{ borderColor: LINE }}>
                      <option value="">Choose engine</option>{quote.engines.map((e) => <option key={e}>{e}</option>)}
                      <option value="unsure">Not sure</option>
                    </select>
                  ) : pricing && !quote ? (
                    <select disabled className={`${input} bg-[#f5f7fb]`} style={{ borderColor: LINE }}><option>Looking up engines…</option></select>
                  ) : (
                    <div className="flex gap-2">
                      <input value={manualEngine} onChange={(e) => setManualEngine(e.target.value)} onBlur={() => setEngine(manualEngine.trim())}
                        placeholder="e.g. 2.0L (optional)" className={input} style={{ borderColor: LINE }} />
                    </div>
                  )}
                </label>
              )}
              {carReady && (
                <div className="rounded-xl bg-[#eef1f6] p-4 text-[15px] leading-relaxed text-[#4a5878]" aria-live="polite">
                  {pricing && !quote ? "Looking up your car… (first time for a car can take up to 20 seconds)" :
                    quote?.spec ? <>Your car takes <strong className="text-[#0d1b3e]">{quote.spec.grade.replace(/^Euro /, "")} full synthetic, {quote.spec.capacityL} L</strong>. We bring the right oil and filter.</> :
                    "We'll bring the right oil for your car."}
                </div>
              )}
            </>
          )}

          {/* 1. Services */}
          {step === 1 && (
            <>
              <h1 className="text-[22px] font-bold">What do you need?</h1>
              <div className="flex flex-col gap-2.5" role="radiogroup" aria-label="Service">
                {jobsShown.map((j) => (
                  <button key={j.id} role="radio" aria-checked={job === j.id} onClick={() => { setJob(j.id); if (j.id !== "oil_change") setAddons((a) => a.filter((x) => x !== "tires")); }}
                    className="rounded-2xl p-4 flex justify-between items-center gap-3 text-left border" style={card(job === j.id)}>
                    <span className="flex flex-col gap-0.5">
                      <span className="font-bold text-[18px]">{j.name}</span>
                      <span className="text-sm text-[#4a5878]">{j.note}</span>
                    </span>
                    {job === j.id && jobLine && !pricing && <span className="text-[26px] font-extrabold whitespace-nowrap" style={{ fontFamily: "var(--font-condensed)" }}>{short(j.id === "seasonal" ? quote!.subtotal - (quote!.lines.filter((l) => !/^(Full synthetic|Tire change|Seasonal package)/.test(l.label)).reduce((t, l) => t + l.amount, 0)) : jobLine.amount)}</span>}
                  </button>
                ))}
              </div>

              {addonList.length > 0 && (
                <>
                  <p className="mt-1 text-[15px] font-bold text-[#4a5878]">{job === "parts" ? "What should we do? ($50 visit + parts)" : "Add while we're there"}</p>
                  <div className="flex flex-col gap-2">
                    {addonList.map((id) => {
                      const on = addons.includes(id);
                      const nameOf = services?.addons.find((a) => a.id === id)?.name ?? (id === "tires" ? "Tire change" : id);
                      const priced = quote?.lines.find((l) => l.label.toLowerCase().startsWith(id === "tires" ? "tire change" : nameOf.toLowerCase().split(" ")[0]));
                      return (
                        <button key={id} aria-pressed={on} onClick={() => setAddons((a) => on ? a.filter((x) => x !== id) : [...a, id])}
                          className="min-h-16 w-full rounded-xl px-3.5 py-3 flex items-center justify-between gap-3 text-left border" style={card(on)}>
                          <span className="flex flex-col gap-0.5">
                            <span className="font-bold text-base">{nameOf}</span>
                            <span className="text-sm text-[#4a5878]">{id === "tires" ? (services?.season ? "Tires on rims, $15 off with your oil change" : "Tires on rims, $10 off with your oil change") : ADDON_NOTES[id]}</span>
                          </span>
                          <span className="font-bold text-base whitespace-nowrap">{on ? (priced ? short(priced.amount) : "Added") : "Add"}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {(job === "oil_change" || job === "seasonal") && (
                <details className="rounded-xl border border-[#c8d0e0] p-3">
                  <summary className="font-semibold text-[15px] cursor-pointer">Bringing your own oil or filter?</summary>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {([["", "No"], ["both", "Oil + filter"], ["oil", "Oil only"], ["filter", "Filter only"]] as const).map(([k, n]) => (
                      <button key={k} onClick={() => setOwn(k)} className="h-10 px-3 rounded-full border text-sm font-bold" style={{ background: own === k ? NAVY : "#fff", color: own === k ? "#fff" : NAVY, borderColor: own === k ? NAVY : LINE }}>{n}</button>
                    ))}
                  </div>
                </details>
              )}
            </>
          )}

          {/* 2. Time */}
          {step === 2 && (
            <>
              <h1 className="text-[22px] font-bold">Pick a day and time</h1>
              <div className="-mx-5 px-5 overflow-x-auto">
                <div className="flex gap-2 w-max pb-1">
                  {days.map((d) => { const p = dayParts(d); const on = d === date; return (
                    <button key={d} onClick={() => setDate(d)} aria-pressed={on} aria-label={p.long}
                      className="w-[68px] h-[72px] rounded-xl border flex flex-col items-center justify-center" style={pickStyle(on)}>
                      <span className="text-[13px] font-semibold">{d === today() ? "Today" : p.dow}</span>
                      <span className="text-[22px] font-extrabold leading-none">{p.num}</span>
                      <span className="text-[11px] font-semibold text-[#4a5878]">{p.mon}</span>
                    </button>); })}
                </div>
              </div>
              <p className="mt-1 text-[15px] font-bold text-[#4a5878]">Open times on {dayParts(date).long}</p>
              {slots === null ? <p className="text-[#4a5878]">Checking…</p> : slots.length === 0 ? (
                <p className="rounded-xl bg-[#eef1f6] p-4 text-[#4a5878]">{dayNote || "No open times this day."} Try another day.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {slots.map((s) => (
                    <button key={s.start} onClick={() => setSlot(s)} aria-pressed={slot?.start === s.start}
                      className="h-12 rounded-xl border text-[15px] font-bold" style={pickStyle(slot?.start === s.start)}>{s.label}</button>
                  ))}
                </div>
              )}
              {job === "seasonal" && !services?.season && <p className="rounded-xl bg-[#fff6dd] p-3 text-sm">The seasonal package isn&apos;t offered on this day. Pick a day in season, or go back and choose an oil change with a tire change.</p>}
              <p className="text-sm text-[#4a5878]">Your time is held for you as soon as you book.</p>
            </>
          )}

          {/* 3. Details */}
          {step === 3 && (
            <>
              <h1 className="text-[22px] font-bold">Where should we come?</h1>
              <label className={labelCls}>Your name<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="First and last name" className={input} style={{ borderColor: LINE }} /></label>
              <label className={labelCls}>Mobile number<input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" autoComplete="tel" inputMode="tel" placeholder="902-555-0123" className={input} style={{ borderColor: LINE }} /></label>
              <label className={labelCls}>Email (optional)<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" placeholder="For your receipt" className={input} style={{ borderColor: LINE }} /></label>
              <label className={labelCls}>Address<input value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" placeholder="Street address, town" className={input} style={{ borderColor: LINE }} /></label>
              <label className={labelCls}>Anything we should know? (optional)<input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Gate code, parking spot" className={input} style={{ borderColor: LINE }} /></label>
              <p className="text-sm text-[#4a5878]">Travel is free within 30 km. If you&apos;re further out, we&apos;ll let you know the fee before we come.</p>
            </>
          )}

          {/* 4. Review */}
          {step === 4 && quote && slot && (
            <>
              <h1 className="text-[22px] font-bold">Check and book</h1>
              <div className="rounded-xl border border-[#c8d0e0] p-4 flex flex-col gap-1 text-[15px]">
                <p className="font-bold">{dayParts(date).long}, {slot.label}</p>
                <p className="text-[#4a5878]">{year} {make} {model}{engine && engine !== "unsure" ? ` · ${engine}` : ""}</p>
                <p className="text-[#4a5878]">{address}</p>
                <p className="text-[#4a5878]">{name} · {phone}</p>
              </div>
              <div className="rounded-xl bg-[#eef1f6] p-4 flex flex-col gap-2 text-[15px]">
                {quote.lines.map((l, i) => <div key={i} className="flex justify-between gap-3"><span>{l.label}</span><span>{money(l.amount)}</span></div>)}
                <div className="flex justify-between text-[#4a5878]"><span>HST 14%</span><span>{money(quote.hst)}</span></div>
                <div className="flex justify-between font-extrabold text-lg border-t border-[#c8d0e0] pt-2"><span>Total</span><span>{money(quote.total)}</span></div>
              </div>
              <div className="rounded-xl border-2 p-4 flex flex-col gap-1" style={{ borderColor: NAVY, background: "#fff6dd" }}>
                <p className="font-bold text-[17px]">Pay after the job</p>
                <p className="text-sm text-[#4a5878]">Card, tap, cash or e-transfer when we&apos;re done. Nothing to pay now.</p>
              </div>
            </>
          )}

          {/* 5. Done */}
          {step === 5 && done && (
            <div className="flex flex-col gap-4 pt-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: GOLD }}>
                <svg aria-hidden width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
              </div>
              <h1 className="text-[34px] font-extrabold leading-none" style={{ fontFamily: "var(--font-condensed)" }}>You&apos;re booked.</h1>
              <p className="text-[17px] leading-relaxed">{dayParts(done.date).long} at {done.when}. Total {money(done.total)}, paid after the job.</p>
              <p className="text-[15px] text-[#4a5878]">Need to change it? Call or text <a className="font-bold underline" href="tel:7826408341">782-640-8341</a>.</p>
              {saveState === "ask" && !(saved && saved.cars.some((c) => c.year === year && c.make === make && c.model === model)) && (
                <div className="rounded-2xl border-2 p-4 flex flex-col gap-3" style={{ borderColor: NAVY }}>
                  <p className="font-bold text-[18px]">Save your info for next time?</p>
                  <p className="text-[15px] leading-relaxed text-[#4a5878]">Next time your car, address and number are already filled in. It&apos;s saved only on this phone, and you can clear it any time.</p>
                  <button onClick={saveHere} className="h-[50px] rounded-xl text-white text-[17px] font-bold" style={{ background: NAVY }}>Save on this phone</button>
                  <button onClick={() => setSaveState("declined")} className="h-11 text-base font-semibold text-[#4a5878] underline">No thanks</button>
                </div>
              )}
              {saveState === "saved" && <p className="rounded-xl bg-[#eef1f6] p-4 text-[15px]">Saved. Next time it&apos;s all filled in for you.</p>}
              <button onClick={() => { setStep(0); setYear(""); setMake(""); setModel(""); setEngine(""); setManualEngine(""); setAddons([]); setJob("oil_change"); setSlot(null); setDone(null); setQuote(null); setSaveState("ask"); }}
                className="self-start font-bold underline text-base">Book another car</button>
            </div>
          )}
        </main>

        {/* Price bar */}
        {step < 5 && (
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-10 bg-white border-t border-[#dde3ee] px-5 pt-3 pb-[max(18px,env(safe-area-inset-bottom))] flex flex-col gap-2">
            {err && <p className="text-sm text-red-700" role="alert">{err}</p>}
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-[13px] text-[#4a5878] font-semibold">Your price</span>
                <span className="text-[28px] font-extrabold leading-none" style={{ fontFamily: "var(--font-condensed)" }} aria-live="polite">
                  {quote && carReady && !quote.error ? short(quote.subtotal) : "–"} <span className="text-sm font-semibold text-[#4a5878]" style={{ fontFamily: "var(--font-barlow)" }}>+ HST</span>
                </span>
              </div>
              <button onClick={next} disabled={busy || (step === 0 && carReady && pricing && !quote)}
                className="h-[54px] px-6 rounded-xl text-lg font-extrabold disabled:opacity-60" style={{ background: GOLD, color: NAVY }}>{nextLabel}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
