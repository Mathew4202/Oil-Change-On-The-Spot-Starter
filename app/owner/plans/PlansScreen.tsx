"use client";
// Maintenance plans: send terms, see who agreed, visits used, and monthly payments owing.
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import OwnerNav from "../OwnerNav";

const NAVY = "#0d1b3e", GOLD = "#f2b01e", LINE = "#c8d0e0", MUTED = "#4a5878";
const money = (n: number) => `$${Number(n).toFixed(2)}`;
const nice = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const month = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", { month: "long", timeZone: "UTC" });
const fmt = (p: string) => p.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3");
type Req = { id: string; customer_name: string; phone: string; car: string; visits: number; swaps: number; monthly: number; created_at: string };
type P = { id: string; name: string | null; phone: string; car: string | null; status: string; visits_per_year: number; swaps_per_year: number; per_visit: number; monthly: number; hst_rate: number;
  offered_at: string | null; starts_on: string | null; ends_on: string | null; bill_day: number | null; used: number; owing: { id: string; period: string; total: number; sent_at: string | null }[] };

export default function PlansScreen() {
  const [d, setD] = useState<{ requests: Req[]; plans: P[] } | null>(null); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const load = () => fetch("/api/owner/plans", { cache: "no-store" }).then((r) => r.json()).then(setD).catch(() => setMsg("Couldn't load. Check your connection."));
  useEffect(() => { load(); }, []);
  async function post(body: object, done: string) {
    setBusy(true); setMsg("");
    const r = await fetch("/api/owner/plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok || j.ok === false) return setMsg(j.error || "That didn't work");
    const smsOff = j.sms && !j.sms.sent;
    setMsg(smsOff ? `${done} (the text didn't go out: ${j.sms.status === "not_set_up" ? "texting isn't set up yet" : j.sms.status})` : done); load();
  }
  const offered = d?.plans.filter((p) => p.status === "offered") ?? [], active = d?.plans.filter((p) => p.status === "active") ?? [];
  const field = "h-11 rounded-xl border px-3 text-base w-full bg-white";
  return (
    <div className="min-h-dvh flex flex-col bg-[#eef1f6] text-[#0d1b3e] max-w-xl mx-auto">
      <header className="sticky top-0 z-10 text-white px-4 pt-[max(14px,env(safe-area-inset-top))] pb-3 flex items-end justify-between gap-3" style={{ background: NAVY }}>
        <div>
          <Link href={"/owner/customers" as Route} className="text-sm text-[#c9d3ea] font-semibold no-underline">‹ Customers</Link>
          <h1 className="text-[30px] leading-none font-extrabold" style={{ fontFamily: "var(--font-condensed)" }}>Maintenance plans</h1>
        </div>
        {!form && <button onClick={() => setForm({ name: "", phone: "", car: "", visits: "6", perVisit: "", swaps: "0", swapPrice: "" })} className="h-10 px-3 rounded-lg font-bold text-sm" style={{ background: GOLD, color: NAVY }}>+ New plan</button>}
      </header>
      <div className="flex-1 p-4 flex flex-col gap-4 pb-28">
        {msg && <p className="rounded-xl p-3 font-semibold bg-white" role="status">{msg}</p>}
        {!d && <p className="text-center py-10" style={{ color: MUTED }}>Loading…</p>}

        {form && (
          <section className="bg-white rounded-2xl p-4 flex flex-col gap-2">
            <h2 className="font-extrabold text-lg">Offer a plan</h2>
            <p className="text-sm" style={{ color: MUTED }}>Tip: the plan page on the website works out the price for their car. They get the terms by text and reply I AGREE.</p>
            <div className="grid grid-cols-2 gap-2">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" className={field} style={{ borderColor: LINE }} />
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Mobile" type="tel" className={field} style={{ borderColor: LINE }} />
            </div>
            <input value={form.car} onChange={(e) => setForm({ ...form, car: e.target.value })} placeholder="Car, e.g. 2020 Hyundai Kona" className={field} style={{ borderColor: LINE }} />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm font-semibold">Oil changes a year<input value={form.visits} onChange={(e) => setForm({ ...form, visits: e.target.value.replace(/\D/g, "") })} inputMode="numeric" className={field} style={{ borderColor: LINE }} /></label>
              <label className="text-sm font-semibold">Price per oil change<input value={form.perVisit} onChange={(e) => setForm({ ...form, perVisit: e.target.value.replace(/[^\d.]/g, "") })} inputMode="decimal" placeholder="e.g. 105" className={field} style={{ borderColor: LINE }} /></label>
              <label className="text-sm font-semibold">Tire swaps a year<input value={form.swaps} onChange={(e) => setForm({ ...form, swaps: e.target.value.replace(/\D/g, "") })} inputMode="numeric" className={field} style={{ borderColor: LINE }} /></label>
              <label className="text-sm font-semibold">Price per swap<input value={form.swapPrice} onChange={(e) => setForm({ ...form, swapPrice: e.target.value.replace(/[^\d.]/g, "") })} inputMode="decimal" className={field} style={{ borderColor: LINE }} /></label>
            </div>
            {Number(form.perVisit) > 0 && <p className="text-sm font-semibold">{money((Number(form.visits) * Number(form.perVisit) + Number(form.swaps) * Number(form.swapPrice || 0)) / 12)} a month + HST</p>}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setForm(null)} className="h-11 rounded-xl border font-bold" style={{ borderColor: LINE }}>Cancel</button>
              <button disabled={busy} onClick={() => post({ action: "offer", plan: { name: form.name, phone: form.phone, car: form.car, visits: Number(form.visits), perVisit: Number(form.perVisit), swaps: Number(form.swaps), swapPrice: Number(form.swapPrice || 0) } }, "Terms texted.").then(() => setForm(null))}
                className="h-11 rounded-xl font-extrabold disabled:opacity-60" style={{ background: GOLD, color: NAVY }}>Text them the terms</button>
            </div>
          </section>
        )}

        {d && d.requests.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="font-extrabold text-lg">Asked on the website</h2>
            {d.requests.map((r) => (
              <div key={r.id} className="bg-white rounded-2xl p-4 flex flex-col gap-2 border-2" style={{ borderColor: GOLD }}>
                <p className="font-bold text-[17px]">{r.customer_name} · <a href={`tel:${r.phone}`} className="underline">{fmt(r.phone)}</a></p>
                <p className="text-[15px]">{r.car} · {r.visits} oil changes{r.swaps ? ` + ${r.swaps} swaps` : ""} · <strong>{money(r.monthly)}/month + HST</strong></p>
                <div className="flex flex-wrap gap-2">
                  <button disabled={busy} onClick={() => post({ action: "offer", requestId: r.id }, `Terms texted to ${r.customer_name}. The plan starts when they reply I AGREE.`)} className="h-11 px-3 rounded-lg font-extrabold disabled:opacity-60" style={{ background: GOLD, color: NAVY }}>Text them the terms</button>
                  <button disabled={busy} onClick={() => post({ action: "decline", requestId: r.id }, "Removed.")} className="h-11 px-3 rounded-lg border font-bold text-sm" style={{ borderColor: LINE }}>Not going ahead</button>
                </div>
              </div>
            ))}
          </section>
        )}

        {offered.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="font-extrabold text-lg">Waiting for I AGREE</h2>
            {offered.map((p) => (
              <div key={p.id} className="bg-white rounded-2xl p-4 flex flex-col gap-2">
                <p className="font-bold">{p.name || fmt(p.phone)} · {p.car}</p>
                <p className="text-sm" style={{ color: MUTED }}>{money(p.monthly)}/month + HST · terms sent {p.offered_at ? nice(p.offered_at) : ""}</p>
                <div className="flex flex-wrap gap-2">
                  <button disabled={busy} onClick={() => post({ action: "terms", planId: p.id }, "Terms texted again.")} className="h-10 px-3 rounded-lg border font-bold text-sm" style={{ borderColor: LINE }}>Text terms again</button>
                  <button disabled={busy} onClick={() => post({ action: "start", planId: p.id }, "Plan started. First pay link sent.")} className="h-10 px-3 rounded-lg border font-bold text-sm" style={{ borderColor: LINE }}>They agreed another way: start it</button>
                  <button disabled={busy} onClick={() => post({ action: "end", planId: p.id, cancelled: true }, "Offer cancelled.")} className="h-10 px-3 rounded-lg font-bold text-sm underline" style={{ color: MUTED }}>Cancel offer</button>
                </div>
              </div>
            ))}
          </section>
        )}

        {d && (
          <section className="flex flex-col gap-2">
            <h2 className="font-extrabold text-lg">On a plan ({active.length})</h2>
            {active.length === 0 && <p className="bg-white rounded-2xl p-4" style={{ color: MUTED }}>Nobody yet. Plans start when the customer replies I AGREE.</p>}
            {active.map((p) => (
              <div key={p.id} className="bg-white rounded-2xl p-4 flex flex-col gap-2">
                <div className="flex justify-between gap-2"><p className="font-bold text-[17px]">{p.name || fmt(p.phone)}</p><span className="text-sm font-bold">{money(p.monthly)}/mo</span></div>
                <p className="text-[15px]">{p.car} · <strong>{p.used} of {p.visits_per_year}</strong> oil changes used{p.swaps_per_year ? ` · ${p.swaps_per_year} swaps` : ""}</p>
                <p className="text-sm" style={{ color: MUTED }}>{p.starts_on ? `${nice(p.starts_on)} to ${nice(p.ends_on!)}` : ""} · billed on the {p.bill_day}{p.bill_day === 1 ? "st" : p.bill_day === 2 ? "nd" : p.bill_day === 3 ? "rd" : "th"}</p>
                {p.owing.map((b) => (
                  <div key={b.id} className="rounded-xl p-3 flex flex-col gap-2" style={{ background: "#fff6dd" }}>
                    <p className="font-semibold text-[#8a5a00]">{month(b.period)} payment owing: {money(b.total)}{b.sent_at ? "" : " (link not sent yet)"}</p>
                    <div className="flex flex-wrap gap-2 text-sm">
                      <button disabled={busy} onClick={() => post({ action: "bill", billId: b.id }, "Pay link texted.")} className="h-9 px-3 rounded-lg border font-bold bg-white" style={{ borderColor: LINE }}>Text pay link</button>
                      {[["etransfer", "E-transfer"], ["cash", "Cash"], ["card_terminal", "Card"]].map(([k, n]) => <button key={k} disabled={busy} onClick={() => post({ action: "paid", billId: b.id, method: k }, "Marked paid.")} className="h-9 px-3 rounded-lg border font-bold bg-white" style={{ borderColor: LINE }}>Paid: {n}</button>)}
                    </div>
                  </div>
                ))}
                <button disabled={busy} onClick={() => { if (confirm("End this plan? If they're leaving early, charge the regular price for visits they had, minus what they paid.")) post({ action: "end", planId: p.id, cancelled: true }, "Plan ended."); }} className="self-start text-sm underline font-semibold" style={{ color: MUTED }}>End plan</button>
              </div>
            ))}
          </section>
        )}
      </div>
      <OwnerNav />
    </div>
  );
}
