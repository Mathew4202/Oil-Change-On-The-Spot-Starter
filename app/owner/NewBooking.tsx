"use client";
// Book someone by phone: find them (or add them), pick the car, pick a time, see the price, save.
import { TIRE_CHANGE, ROTATION } from "@/lib/os/pricing-engine";
import AddressField, { type Place } from "@/components/AddressField";
import { useEffect, useMemo, useState } from "react";

const NAVY = "#0d1b3e", GOLD = "#f2b01e";
export type Vehicle = { id: string; year: number | null; make: string | null; model: string | null; engine: string | null };
export type Customer = { id: string; first_name: string | null; last_name: string | null; phone: string | null; email: string | null; address: string | null; vehicles: Vehicle[] };
type Slot = { time: string; label: string; start: string };
type Quote = { lines: { label: string; amount: number }[]; subtotal: number; total: number; spec: { grade: string; capacityL: number; filter: string | null; engine?: string | null } | null; engines?: string[]; error?: string };

const field = "h-12 rounded-xl border border-[#c8d0e0] px-3 text-base w-full bg-white";
const lbl = "flex flex-col gap-1 text-sm font-semibold";
const ADDONS: [string, string][] = [["tires", "Tire change"], ["wipers", "Wipers"], ["cabin_filter", "Cabin filter"], ["engine_filter", "Engine air filter"], ["battery", "Battery"], ["coolant", "Coolant top-up"], ["washer_fluid", "Washer fluid top-up"]];
type JobKind = "oil_change" | "seasonal" | "parts" | "diagnostic" | "tires" | "rotation";

function halifaxIso(date: string, hhmm: string) {
  // Turn a Halifax wall-clock time into an exact moment (handles daylight saving)
  const [y, m, d] = date.split("-").map(Number); const [h, mi] = hhmm.split(":").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, h, mi));
  const off = (at: Date) => {
    const n = new Intl.DateTimeFormat("en-US", { timeZone: "America/Halifax", timeZoneName: "longOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value || "GMT-04:00";
    const x = n.match(/GMT([+-])(\d{2}):(\d{2})/); return x ? (x[1] === "-" ? -1 : 1) * (Number(x[2]) * 60 + Number(x[3])) : -240;
  };
  return new Date(guess.getTime() - off(new Date(guess.getTime() - off(guess) * 60000)) * 60000).toISOString();
}

export default function NewBooking({ date: initialDate, onClose, customer: preset }: { date: string; onClose: (bookedDate?: string) => void; customer?: Customer }) {
  // Customer
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [first, setFirst] = useState(""); const [last, setLast] = useState("");
  const [phone, setPhone] = useState(""); const [address, setAddress] = useState("");
  const [place, setPlace] = useState<Place | null>(null);
  // Car
  const [vehicleId, setVehicleId] = useState<string>("new");
  const [year, setYear] = useState(""); const [make, setMake] = useState(""); const [model, setModel] = useState(""); const [engine, setEngine] = useState("");
  const [cars, setCars] = useState(1);
  // Job
  const [job, setJob] = useState<JobKind>("oil_change");
  const [season, setSeason] = useState<string | null>(null);
  const [addons, setAddons] = useState<string[]>([]);
  const [own, setOwn] = useState<"" | "both" | "oil" | "filter">("");
  const [date, setDate] = useState(initialDate);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [time, setTime] = useState("");
  const [otherTime, setOtherTime] = useState("");
  const [payMode, setPayMode] = useState<"after" | "online">("after");
  const [special, setSpecial] = useState("");
  const [notes, setNotes] = useState("");
  // Price + saving
  const [quote, setQuote] = useState<Quote | null>(null);
  const [pricing, setPricing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Search customers as you type
  useEffect(() => {
    if (customer || search.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/owner/customers?q=${encodeURIComponent(search)}`);
      if (r.ok) setResults((await r.json()).customers);
    }, 250);
    return () => clearTimeout(t);
  }, [search, customer]);

  // opened from a customer's page: start with them picked
  useEffect(() => { if (preset) pick(preset); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function pick(c: Customer) {
    setCustomer(c); setResults([]);
    setFirst(c.first_name || ""); setLast(c.last_name || ""); setPhone(c.phone || ""); setAddress(c.address || "");
    const v = c.vehicles?.[0];
    if (v) chooseVehicle(v); else setVehicleId("new");
  }
  function chooseVehicle(v: Vehicle | null) {
    if (!v) { setVehicleId("new"); setYear(""); setMake(""); setModel(""); setEngine(""); return; }
    setVehicleId(v.id); setYear(String(v.year ?? "")); setMake(v.make || ""); setModel(v.model || ""); setEngine(v.engine || "");
  }
  function startOver() { setCustomer(null); setSearch(""); setFirst(""); setLast(""); setPhone(""); setAddress(""); chooseVehicle(null); }

  // Open times for the chosen day
  useEffect(() => {
    setSlots(null); setTime("");
    fetch(`/api/os/services?date=${date}`).then((r) => r.json()).then((d) => setSeason(d.season)).catch(() => setSeason(null));
    fetch(`/api/os/slots?date=${date}&cars=${cars}&job=${job}&addons=${job === "oil_change" && addons.includes("tires") ? "tires" : ""}`).then((r) => r.json()).then((d) => setSlots(d.slots || [])).catch(() => setSlots([]));
  }, [date, cars, job, addons]);

  // Live price
  const carReady = /^\d{4}$/.test(year) && make.trim() && model.trim();
  useEffect(() => {
    if (!carReady) { setQuote(null); return; }
    const t = setTimeout(async () => {
      setPricing(true);
      const p = new URLSearchParams({ year, make: make.trim(), model: model.trim(), cars: String(cars) });
      if (engine.trim()) p.set("engine", engine.trim());
      p.set("job", job); p.set("date", date);
      const sent = job === "oil_change" ? addons : job === "seasonal" || job === "parts" ? addons.filter((a) => a !== "tires") : [];
      if (sent.length) p.set("addons", sent.join(","));
      if ((job === "oil_change" || job === "seasonal") && own) p.set("own", own);
      if (place?.km != null) p.set("km", String(place.km));
      const r = await fetch(`/api/os/quote?${p}`);
      setQuote(await r.json()); setPricing(false);
    }, 600);
    return () => clearTimeout(t);
  }, [year, make, model, engine, addons, own, cars, carReady, job, date, place?.km]);

  const startIso = useMemo(() => {
    if (otherTime) return halifaxIso(date, otherTime);
    return slots?.find((s) => s.time === time)?.start || "";
  }, [otherTime, time, slots, date]);

  async function save() {
    setErr("");
    if (!first.trim() || phone.replace(/\D/g, "").length < 10) return setErr("Add their name and a 10-digit phone number.");
    if (!address.trim()) return setErr("Add the address for the job.");
    if (!carReady) return setErr("Add the car: year, make and model.");
    if (job === "parts" && !addons.filter((a) => a !== "tires").length) return setErr("Pick what they need for the parts visit.");
    if (!startIso) return setErr("Pick a time.");
    setBusy(true);
    const r = await fetch("/api/owner/book", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: first.trim(), lastName: last.trim(), phone, address: address.trim(), ...(place?.placeId ? { placeId: place.placeId } : {}),
        car: { year: Number(year), make: make.trim(), model: model.trim(), ...(engine.trim() ? { engine: engine.trim() } : {}) },
        job, addons: job === "oil_change" ? addons : job === "seasonal" || job === "parts" ? addons.filter((a) => a !== "tires") : [], own: job === "oil_change" || job === "seasonal" ? own || null : null, start: startIso, cars, payMode, notes: notes.trim() || undefined,
        priceOverride: special.trim() ? Number(special) : null,
        customerId: customer?.id ?? null,
      }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(j.error || "Couldn't save the booking");
    onClose(j.date);
  }

  const chip = (on: boolean) => ({ background: on ? NAVY : "#fff", color: on ? "#fff" : NAVY, borderColor: on ? NAVY : "#c8d0e0" });

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex justify-center" onClick={() => onClose()}>
      <div className="w-full max-w-xl h-full bg-[#eef1f6] flex flex-col" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="New booking">
        <div className="flex items-center justify-between p-4 text-white pt-[max(16px,env(safe-area-inset-top))]" style={{ background: NAVY }}>
          <h2 className="text-2xl font-extrabold" style={{ fontFamily: "var(--font-condensed)" }}>New booking</h2>
          <button onClick={() => onClose()} className="h-10 px-3 rounded-lg border border-[#3b4d7a] font-bold text-sm">Cancel</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 pb-32">
          {/* 1. Customer */}
          <section className="bg-white rounded-2xl p-4 flex flex-col gap-3">
            <h3 className="font-extrabold text-lg">1. Customer</h3>
            {!customer ? (
              <>
                <label className={lbl}>Search by name or phone
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. Dorothy or 902 448" className={field} autoFocus />
                </label>
                {results.length > 0 && (
                  <div className="flex flex-col gap-1">
                    {results.map((c) => (
                      <button key={c.id} onClick={() => pick(c)} className="text-left rounded-xl border border-[#c8d0e0] p-3">
                        <span className="font-bold">{[c.first_name, c.last_name].filter(Boolean).join(" ")}</span>
                        <span className="text-sm text-[#4a5878]"> · {c.phone || "no phone"}{c.vehicles?.length ? ` · ${c.vehicles.map((v) => `${v.year ?? ""} ${v.model ?? ""}`.trim()).join(", ")}` : ""}</span>
                      </button>
                    ))}
                  </div>
                )}
                {search.trim().length >= 2 && results.length === 0 && <p className="text-sm text-[#4a5878]">No match. Fill in their details below to add them.</p>}
              </>
            ) : (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-[#eef1f6] p-3">
                <span className="font-bold">Returning customer</span>
                <button onClick={startOver} className="text-sm font-bold underline">Change</button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <label className={lbl}>First name<input value={first} onChange={(e) => setFirst(e.target.value)} className={field} /></label>
              <label className={lbl}>Last name<input value={last} onChange={(e) => setLast(e.target.value)} className={field} /></label>
            </div>
            <label className={lbl}>Phone{customer && !customer.phone && <span className="font-normal text-[#8a5a00]"> No phone on file, add it and we&apos;ll save it</span>}
              <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="902 555 1234" className={field} style={customer && !phone ? { borderColor: GOLD, borderWidth: 2 } : undefined} /></label>
            <AddressField key={customer?.id ?? "new"} value={address} onChange={setAddress} onPlace={setPlace} label="Job address" placeholder="Start typing the street address" labelClass={lbl} inputClass={field} owner />
          </section>

          {/* 2. Car */}
          <section className="bg-white rounded-2xl p-4 flex flex-col gap-3">
            <h3 className="font-extrabold text-lg">2. Car</h3>
            {customer?.vehicles?.length ? (
              <div className="flex flex-wrap gap-2">
                {customer.vehicles.map((v) => (
                  <button key={v.id} onClick={() => chooseVehicle(v)} className="h-10 px-3 rounded-full border text-sm font-bold" style={chip(vehicleId === v.id)}>
                    {[v.year, v.make, v.model].filter(Boolean).join(" ")}
                  </button>
                ))}
                <button onClick={() => chooseVehicle(null)} className="h-10 px-3 rounded-full border text-sm font-bold" style={chip(vehicleId === "new")}>+ Another car</button>
              </div>
            ) : null}
            <div className="grid grid-cols-3 gap-3">
              <label className={lbl}>Year<input value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="2019" className={field} /></label>
              <label className={`${lbl} col-span-2`}>Make<input value={make} onChange={(e) => setMake(e.target.value)} placeholder="Honda" className={field} /></label>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <label className={`${lbl} col-span-2`}>Model<input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Civic" className={field} /></label>
              <label className={lbl}>How many<input value={cars} onChange={(e) => setCars(Math.max(1, Math.min(5, Number(e.target.value.replace(/\D/g, "")) || 1)))} inputMode="numeric" className={field} /></label>
            </div>
            {quote?.engines && quote.engines.length > 1 ? (
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold">Which engine?</p>
                <div className="flex flex-wrap gap-2">
                  {quote.engines.map((e) => <button key={e} onClick={() => setEngine(e)} className="h-10 px-3 rounded-full border text-sm font-bold" style={chip(engine === e)}>{e}</button>)}
                </div>
              </div>
            ) : (
              <label className={lbl}>Engine (optional)<input value={engine} onChange={(e) => setEngine(e.target.value)} placeholder="2.0L" className={field} /></label>
            )}
          </section>

          {/* 3. Job */}
          <section className="bg-white rounded-2xl p-4 flex flex-col gap-3">
            <h3 className="font-extrabold text-lg">3. Job</h3>
            <div className="grid grid-cols-2 gap-2">
              {([["oil_change", "Oil change"], ["seasonal", "Seasonal package"], ["tires", "Tire change"], ["rotation", "Tire rotation"], ["parts", "Parts only"], ["diagnostic", "Diagnostic"]] as const).map(([k, n]) => (
                <button key={k} onClick={() => setJob(k)} className="h-11 rounded-lg border text-sm font-bold" style={chip(job === k)}>{n}</button>
              ))}
            </div>
            {job === "seasonal" && (
              <p className="text-sm text-[#4a5878]">Oil change + tire change on rims, $15 off.{!season && <span className="text-[#8a5a00] font-semibold"> Out of season on this day: customers can&apos;t book it online, but you can.</span>}</p>
            )}
            {job === "diagnostic" && <p className="text-sm text-[#4a5878]">$100 to find the problem. Any repair is quoted after.</p>}
            {job === "tires" && <p className="text-sm text-[#4a5878]">Tires already on rims: sedan ${TIRE_CHANGE.Sedan}, SUV ${TIRE_CHANGE["SUV/Crossover"]}, large SUV ${TIRE_CHANGE["Large SUV"]}, truck ${TIRE_CHANGE.Truck}, sports car ${TIRE_CHANGE["Sports Car"]}.</p>}
            {job === "rotation" && <p className="text-sm text-[#4a5878]">Tire rotation: ${ROTATION.Sedan}.</p>}
            {(job === "oil_change" || job === "seasonal" || job === "parts") && (
              <>
                <p className="text-sm font-semibold">{job === "parts" ? "What do they need? ($50 visit + parts)" : "Add-ons"}</p>
                <div className="flex flex-wrap gap-2">
                  {ADDONS.filter(([k]) => job === "oil_change" || k !== "tires").map(([k, n]) => (
                    <button key={k} onClick={() => setAddons((a) => a.includes(k) ? a.filter((x) => x !== k) : [...a, k])} className="h-10 px-3 rounded-full border text-sm font-bold" style={chip(addons.includes(k))}>{n}</button>
                  ))}
                </div>
              </>
            )}
            {(job === "oil_change" || job === "seasonal") && (
              <>
                <p className="text-sm font-semibold">Customer supplies</p>
                <div className="flex flex-wrap gap-2">
                  {([["", "Nothing"], ["both", "Oil + filter"], ["oil", "Oil only"], ["filter", "Filter only"]] as const).map(([k, n]) => (
                    <button key={k} onClick={() => setOwn(k)} className="h-10 px-3 rounded-full border text-sm font-bold" style={chip(own === k)}>{n}</button>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* 4. Time */}
          <section className="bg-white rounded-2xl p-4 flex flex-col gap-3">
            <h3 className="font-extrabold text-lg">4. Time</h3>
            <label className={lbl}>Day<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} /></label>
            {slots === null ? <p className="text-sm text-[#4a5878]">Checking open times…</p> : slots.length ? (
              <div className="grid grid-cols-4 gap-2">
                {slots.map((s) => (
                  <button key={s.time} onClick={() => { setTime(s.time); setOtherTime(""); }} className="h-11 rounded-lg border text-sm font-bold" style={chip(time === s.time && !otherTime)}>{s.label.replace(" ", " ")}</button>
                ))}
              </div>
            ) : <p className="text-sm text-[#4a5878]">No open times in your usual hours this day.</p>}
            <label className={lbl}>Or another time (outside usual hours)
              <input type="time" value={otherTime} onChange={(e) => setOtherTime(e.target.value)} className={field} />
            </label>
          </section>

          {/* 5. Payment + price */}
          <section className="bg-white rounded-2xl p-4 flex flex-col gap-3">
            <h3 className="font-extrabold text-lg">5. Price</h3>
            {!carReady ? <p className="text-sm text-[#4a5878]">Add the car to see the price.</p> : pricing || !quote ? (
              <p className="text-sm text-[#4a5878]">Working out the price…{job === "oil_change" || job === "seasonal" ? " (a car we've never done takes up to 20 seconds the first time)" : ""}</p>
            ) : quote.error ? <p className="text-sm text-red-700">{quote.error}</p> : (
              <div className="flex flex-col gap-1 text-[15px]">
                {quote.spec && <p className="text-[#4a5878]">{quote.spec.grade} · {quote.spec.capacityL} L{quote.spec.filter ? ` · filter ${quote.spec.filter}` : ""}</p>}
                {quote.lines.map((l, i) => <div key={i} className="flex justify-between gap-3"><span className="text-[#4a5878]">{l.label}</span><span>${l.amount.toFixed(2)}</span></div>)}
                <div className="flex justify-between font-bold"><span>Total with HST</span><span>${quote.total.toFixed(2)}</span></div>
              </div>
            )}
            <label className={lbl}>Special price before HST (optional)
              <input value={special} onChange={(e) => setSpecial(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="Leave empty for the normal price" className={field} />
            </label>
            <div className="flex gap-2">
              {([["after", "Pays after"], ["online", "Already paid"]] as const).map(([k, n]) => (
                <button key={k} onClick={() => setPayMode(k)} className="h-10 px-3 rounded-full border text-sm font-bold" style={chip(payMode === k)}>{n}</button>
              ))}
            </div>
            <label className={lbl}>Notes (optional)<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Gate code, parks on the street…" className="rounded-xl border border-[#c8d0e0] p-3 text-base" /></label>
          </section>
        </div>

        <div className="fixed bottom-0 inset-x-0 z-50 bg-white border-t border-[#dde3ee] p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <div className="max-w-xl mx-auto flex flex-col gap-2">
            {err && <p className="text-sm text-red-700" role="alert">{err}</p>}
            <button onClick={save} disabled={busy} className="h-13 py-3.5 rounded-xl font-extrabold text-base disabled:opacity-60" style={{ background: GOLD, color: NAVY }}>
              {busy ? "Saving…" : "Book it"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
