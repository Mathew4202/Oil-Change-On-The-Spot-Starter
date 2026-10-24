"use client";
// Fleet request form: company, contact, vehicles and the services they want.
import { useState } from "react";
import { FLEET_SERVICES } from "@/lib/site/fleet";
import { trackLead } from "@/lib/site/track";
import { NAVY, GOLD, LINE, MUTED } from "@/components/site/brand";

const field = "h-12 w-full rounded-xl border px-3 text-[16px] bg-white font-normal";
const lbl = "flex flex-col gap-1 text-[15px] font-semibold";

export default function FleetRequestClient() {
  const [f, setF] = useState({ company: "", contactName: "", role: "", phone: "", email: "", vehicles: "", vehicleTypes: "", howOften: "", address: "", notes: "", website: "" });
  const [services, setServices] = useState<string[]>(["oil"]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [done, setDone] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function send(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (f.company.trim().length < 2 || f.contactName.trim().length < 2) return setErr("Add your company and your name.");
    if (f.phone.replace(/\D/g, "").length < 10) return setErr("Add a 10-digit phone number.");
    setBusy(true);
    const r = await fetch("/api/os/fleet", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, vehicles: f.vehicles ? Number(f.vehicles) : undefined, services }) })
      .then(async (x) => ({ ok: x.ok, ...(await x.json().catch(() => ({}))) })).catch(() => ({ ok: false, error: "No connection. Please try again." }));
    setBusy(false);
    if (!r.ok) return setErr(r.error || "Couldn't send it. Please call or text us.");
    setDone(true); trackLead("fleet_request", { service_type: "fleet" });
  }

  if (done) return (
    <div className="rounded-2xl p-6 flex flex-col gap-2" style={{ background: GOLD, color: NAVY }} role="status">
      <p className="text-[26px] font-extrabold" style={{ fontFamily: "var(--font-condensed)" }}>Thanks, {f.contactName.split(" ")[0]}.</p>
      <p className="text-[17px]">We&apos;ll get back to you with pricing for {f.company}. If you gave us an email, it comes in writing.</p>
    </div>
  );

  return (
    <form onSubmit={send} className="bg-white rounded-2xl border p-5 flex flex-col gap-4" style={{ borderColor: LINE }}>
      <h2 className="text-[26px] font-extrabold leading-none" style={{ fontFamily: "var(--font-condensed)" }}>Get fleet pricing</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className={lbl}>Company<input value={f.company} onChange={set("company")} autoComplete="organization" className={field} style={{ borderColor: LINE }} /></label>
        <label className={lbl}>Your name<input value={f.contactName} onChange={set("contactName")} autoComplete="name" className={field} style={{ borderColor: LINE }} /></label>
        <label className={lbl}>Your role <span className="font-normal" style={{ color: MUTED }}>(optional)</span><input value={f.role} onChange={set("role")} placeholder="e.g. Fleet manager" className={field} style={{ borderColor: LINE }} /></label>
        <label className={lbl}>Phone<input value={f.phone} onChange={set("phone")} type="tel" autoComplete="tel" className={field} style={{ borderColor: LINE }} /></label>
        <label className={`${lbl} sm:col-span-2`}>Email <span className="font-normal" style={{ color: MUTED }}>(for the written price)</span><input value={f.email} onChange={set("email")} type="email" autoComplete="email" className={field} style={{ borderColor: LINE }} /></label>
        <label className={lbl}>How many vehicles?<input value={f.vehicles} onChange={(e) => setF((x) => ({ ...x, vehicles: e.target.value.replace(/\D/g, "").slice(0, 4) }))} inputMode="numeric" className={field} style={{ borderColor: LINE }} /></label>
        <label className={lbl}>How often?
          <select value={f.howOften} onChange={set("howOften")} className={field} style={{ borderColor: LINE }}>
            <option value="">Not sure</option><option>Every 3 months</option><option>Every 4 months</option><option>Every 6 months</option><option>By mileage</option>
          </select>
        </label>
        <label className={`${lbl} sm:col-span-2`}>What kind of vehicles? <span className="font-normal" style={{ color: MUTED }}>(optional)</span><input value={f.vehicleTypes} onChange={set("vehicleTypes")} placeholder="e.g. 8 Chevy Express vans, 2 Silverado 2500 diesels" className={field} style={{ borderColor: LINE }} /></label>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-[15px] font-semibold mb-1">What do you need?</legend>
        {FLEET_SERVICES.map((s) => {
          const on = services.includes(s.id);
          return (
            <label key={s.id} className="flex items-start gap-3 rounded-xl border p-3 cursor-pointer" style={{ borderColor: on ? NAVY : LINE, background: on ? "#fff6dd" : "#fff" }}>
              <input type="checkbox" checked={on} onChange={() => setServices((x) => on ? x.filter((y) => y !== s.id) : [...x, s.id])} className="mt-1 w-5 h-5" style={{ accentColor: NAVY }} />
              <span><span className="block font-bold">{s.name}</span>{s.note && <span className="block text-sm" style={{ color: MUTED }}>{s.note}</span>}</span>
            </label>
          );
        })}
      </fieldset>
      <label className={lbl}>Where are the vehicles parked? <span className="font-normal" style={{ color: MUTED }}>(optional)</span><input value={f.address} onChange={set("address")} placeholder="Yard address" className={field} style={{ borderColor: LINE }} /></label>
      <label className={lbl}>Anything else? <span className="font-normal" style={{ color: MUTED }}>(optional)</span><textarea value={f.notes} onChange={set("notes")} rows={3} className="rounded-xl border p-3 text-[16px] font-normal" style={{ borderColor: LINE }} /></label>
      <input value={f.website} onChange={set("website")} tabIndex={-1} autoComplete="off" aria-hidden className="hidden" name="website" />
      {err && <p className="text-sm text-red-700" role="alert">{err}</p>}
      <button disabled={busy} className="h-[52px] rounded-xl text-[18px] font-extrabold disabled:opacity-60" style={{ background: GOLD, color: NAVY }}>{busy ? "Sending…" : "Get my fleet price"}</button>
    </form>
  );
}
