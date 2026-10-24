"use client";
// Pick your car and how often you need an oil change: see your monthly plan price, then ask for it.
import { useEffect, useMemo, useState } from "react";
import { FREQUENCIES } from "@/lib/os/plan";
import { trackLead } from "@/lib/site/track";
import { NAVY, GOLD, LINE, MUTED } from "@/components/site/brand";

type Res = { car: string; regular: number; oil: string; plan: { visits: number; swaps: number; perVisit: number; discount: number; swapPrice: number; year: number; monthly: number; hst: number; monthlyWithHst: number; savedPerYear: number } };
const money = (n: number) => `$${n.toFixed(2)}`;

export default function PlanCalculator() {
  const [makes, setMakes] = useState<string[]>([]); const [models, setModels] = useState<string[]>([]);
  const [year, setYear] = useState(""); const [make, setMake] = useState(""); const [model, setModel] = useState("");
  const [visits, setVisits] = useState(6); const [swaps, setSwaps] = useState(0);
  const [res, setRes] = useState<Res | null>(null); const [loading, setLoading] = useState(false);
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const years = useMemo(() => { const y = new Date().getFullYear() + 1; return Array.from({ length: y - 1989 }, (_, i) => String(y - i)); }, []);
  useEffect(() => { fetch("/api/makes").then((r) => r.json()).then((d) => setMakes(d.makes || [])).catch(() => {}); }, []);
  useEffect(() => {
    setModels([]); setModel(""); if (!year || !make) return;
    fetch(`/api/models?make=${encodeURIComponent(make)}&year=${year}`).then((r) => r.json()).then((d) => setModels(d.models || [])).catch(() => {});
  }, [year, make]);
  useEffect(() => {
    if (!year || !make || !model) { setRes(null); return; }
    setLoading(true);
    const t = setTimeout(() => fetch(`/api/os/plan?${new URLSearchParams({ year, make, model, visits: String(visits), swaps: String(swaps) })}`)
      .then((r) => r.json()).then((j) => setRes(j.error ? null : j)).catch(() => setRes(null)).finally(() => setLoading(false)), 300);
    return () => clearTimeout(t);
  }, [year, make, model, visits, swaps]);

  async function ask(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (!name.trim() || phone.replace(/\D/g, "").length < 10) return setErr("Add your name and a 10-digit mobile number.");
    setBusy(true);
    const r = await fetch("/api/os/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ year, make, model, visits, swaps, name, phone, email }) })
      .then(async (x) => ({ ok: x.ok, ...(await x.json().catch(() => ({}))) })).catch(() => ({ ok: false, error: "No connection. Try again." }));
    setBusy(false);
    if (!r.ok) return setErr(r.error || "Couldn't send it.");
    setSent(true); trackLead("maintenance_plan_request", { service_type: "maintenance_plan" });
  }
  const sel = "h-[52px] w-full rounded-xl border px-3 text-[17px] bg-white";
  const chip = (on: boolean) => ({ background: on ? NAVY : "#fff", color: on ? "#fff" : NAVY, borderColor: on ? NAVY : LINE });
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="bg-white rounded-2xl border p-5 flex flex-col gap-4" style={{ borderColor: LINE }}>
        <p className="font-bold text-[20px]">1. Your car</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select aria-label="Year" value={year} onChange={(e) => setYear(e.target.value)} className={sel} style={{ borderColor: LINE }}><option value="">Year</option>{years.map((y) => <option key={y}>{y}</option>)}</select>
          <select aria-label="Make" value={make} onChange={(e) => setMake(e.target.value)} className={sel} style={{ borderColor: LINE }}><option value="">Make</option>{makes.map((m) => <option key={m}>{m}</option>)}</select>
          <select aria-label="Model" value={model} onChange={(e) => setModel(e.target.value)} disabled={!models.length} className={`${sel} disabled:bg-[#f4f6fa]`} style={{ borderColor: LINE }}>
            <option value="">{year && make && !models.length ? "Loading…" : "Model"}</option>{models.map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
        <p className="font-bold text-[20px]">2. How often do you need an oil change?</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {FREQUENCIES.map(([v, t]) => <button key={v} type="button" onClick={() => setVisits(v)} aria-pressed={visits === v} className="h-12 rounded-xl border-2 font-bold text-[15px]" style={chip(visits === v)}>{t} ({v} a year)</button>)}
        </div>
        <p className="text-sm" style={{ color: MUTED }}>Most cars need one every 8,000 km. If you drive about 1,500 km a month, that&apos;s roughly every 5 weeks.</p>
        <p className="font-bold text-[20px]">3. Winter tires on their own rims?</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setSwaps(0)} aria-pressed={swaps === 0} className="h-12 rounded-xl border-2 font-bold" style={chip(swaps === 0)}>No swaps</button>
          <button type="button" onClick={() => setSwaps(2)} aria-pressed={swaps === 2} className="h-12 rounded-xl border-2 font-bold" style={chip(swaps === 2)}>Add both swaps</button>
        </div>
      </div>

      <div className="rounded-2xl p-5 flex flex-col gap-4 text-white" style={{ background: NAVY }}>
        {!res ? (
          <div className="flex-1 flex flex-col justify-center gap-2">
            <p className="text-[26px] font-extrabold" style={{ fontFamily: "var(--font-condensed)" }}>{loading ? "Working out your price…" : "Pick your car to see your monthly price."}</p>
            <p className="text-white/75">It&apos;s worked out from your car&apos;s exact oil, the same way as a regular booking.</p>
          </div>
        ) : (
          <>
            <p className="text-white/80">{res.car}</p>
            <p><span className="text-[56px] leading-none font-extrabold" style={{ fontFamily: "var(--font-condensed)", color: GOLD }}>{money(res.plan.monthly)}</span><span className="text-[18px] font-bold"> /month + HST</span></p>
            <p className="text-white/80 -mt-2">{money(res.plan.monthlyWithHst)} a month with HST, for 12 months.</p>
            <div className="rounded-xl p-4 flex flex-col gap-1 text-[15px]" style={{ background: "rgba(255,255,255,0.08)" }}>
              <p>{res.plan.visits} oil changes at {money(res.plan.perVisit)}{res.plan.discount ? <> <span style={{ color: GOLD }}>(regular {money(res.regular)})</span></> : ""}</p>
              {res.plan.swaps > 0 && <p>{res.plan.swaps} on-rim tire swaps at {money(res.plan.swapPrice)}</p>}
              <p className="text-white/70">{money(res.plan.year)} a year, split into 12 payments</p>
              {res.plan.discount > 0 ? <p className="font-bold" style={{ color: GOLD }}>You save {money(res.plan.savedPerYear)} a year on oil changes, plus free filter and wiper labour.</p>
                : <p className="font-bold" style={{ color: GOLD }}>Your perk: free filter and wiper labour, and top-ups included.</p>}
            </div>
            {sent ? (
              <div className="rounded-xl p-4 text-[16px]" style={{ background: GOLD, color: NAVY }}>
                <p className="font-extrabold">Got it, thanks {name.split(" ")[0]}.</p>
                <p>We&apos;ll text you the plan terms to look over. Reply I AGREE and your plan starts.</p>
              </div>
            ) : (
              <form onSubmit={ask} className="flex flex-col gap-2">
                <p className="font-bold">Want this plan?</p>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" className="h-12 rounded-xl px-3 text-[#0d1b3e]" aria-label="Your name" />
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Mobile number" type="tel" autoComplete="tel" className="h-12 rounded-xl px-3 text-[#0d1b3e]" aria-label="Mobile number" />
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" type="email" autoComplete="email" className="h-12 rounded-xl px-3 text-[#0d1b3e]" aria-label="Email" />
                {err && <p className="text-sm font-semibold" style={{ color: "#ffb4ab" }} role="alert">{err}</p>}
                <button disabled={busy} className="h-[52px] rounded-xl text-[18px] font-extrabold disabled:opacity-60" style={{ background: GOLD, color: NAVY }}>{busy ? "Sending…" : "Text me the plan"}</button>
                <p className="text-xs text-white/70">Nothing is charged yet. We text you the terms first.</p>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
