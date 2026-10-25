"use client";
// Add or edit a fleet account.
import { useState } from "react";

const NAVY = "#0d1b3e", GOLD = "#f2b01e", LINE = "#c8d0e0";
const field = "h-12 rounded-xl border px-3 text-base w-full bg-white font-normal";
const lbl = "flex flex-col gap-1 text-sm font-semibold";
export type AccountIn = { id?: string; business_name?: string; contact_name?: string | null; phone?: string | null; email?: string | null; invoice_email?: string | null;
  address?: string | null; billing?: string; terms_days?: number; service_every_months?: number; via?: string | null; notes?: string | null; fromRequest?: string };

export default function AccountForm({ start, onDone, onCancel }: { start: AccountIn; onDone: (id: string) => void; onCancel: () => void }) {
  const [a, setA] = useState<AccountIn>({ billing: "monthly", terms_days: 30, service_every_months: 4, ...start });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const set = (k: keyof AccountIn) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setA((x) => ({ ...x, [k]: e.target.value }));
  async function save() {
    setBusy(true); setErr("");
    const r = await fetch("/api/owner/fleet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "account", account: a }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok || !j.ok) return setErr(j.error || "Couldn't save");
    onDone(j.id);
  }
  const chip = (on: boolean) => ({ background: on ? NAVY : "#fff", color: on ? "#fff" : NAVY, borderColor: on ? NAVY : LINE });
  return (
    <div className="bg-white rounded-2xl p-4 flex flex-col gap-3">
      <h2 className="font-extrabold text-lg">{a.id ? "Edit account" : "New fleet account"}</h2>
      <label className={lbl}>Business name<input value={a.business_name ?? ""} onChange={set("business_name")} className={field} style={{ borderColor: LINE }} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className={lbl}>Contact<input value={a.contact_name ?? ""} onChange={set("contact_name")} className={field} style={{ borderColor: LINE }} /></label>
        <label className={lbl}>Phone<input value={a.phone ?? ""} onChange={set("phone")} type="tel" className={field} style={{ borderColor: LINE }} /></label>
      </div>
      <label className={lbl}>Email<input value={a.email ?? ""} onChange={set("email")} type="email" className={field} style={{ borderColor: LINE }} /></label>
      <label className={lbl}>Send invoices to <span className="font-normal text-[#4a5878]">(if different, e.g. accounts payable or BBL)</span><input value={a.invoice_email ?? ""} onChange={set("invoice_email")} type="email" className={field} style={{ borderColor: LINE }} /></label>
      <label className={lbl}>Yard address<input value={a.address ?? ""} onChange={set("address")} className={field} style={{ borderColor: LINE }} /></label>
      <div className="flex flex-col gap-1 text-sm font-semibold">Billing
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setA((x) => ({ ...x, billing: "monthly" }))} className="h-11 rounded-lg border font-bold" style={chip(a.billing !== "per_job")}>One invoice a month</button>
          <button type="button" onClick={() => setA((x) => ({ ...x, billing: "per_job" }))} className="h-11 rounded-lg border font-bold" style={chip(a.billing === "per_job")}>Invoice each job</button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className={lbl}>Pay within (days)<input value={a.terms_days ?? 30} onChange={set("terms_days")} inputMode="numeric" className={field} style={{ borderColor: LINE }} /></label>
        <label className={lbl}>Service every (months)<input value={a.service_every_months ?? 4} onChange={set("service_every_months")} inputMode="numeric" className={field} style={{ borderColor: LINE }} /></label>
        <label className={lbl}>Work comes via<input value={a.via ?? ""} onChange={set("via")} placeholder="e.g. BBL Fleet" className={field} style={{ borderColor: LINE }} /></label>
      </div>
      <label className={lbl}>Notes<textarea value={a.notes ?? ""} onChange={set("notes")} rows={2} placeholder="Gate code, who to call on site, PO number…" className="rounded-xl border p-3 text-base font-normal" style={{ borderColor: LINE }} /></label>
      {err && <p className="text-sm text-red-700" role="alert">{err}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onCancel} className="h-12 rounded-xl border font-bold" style={{ borderColor: LINE }}>Cancel</button>
        <button type="button" onClick={save} disabled={busy} className="h-12 rounded-xl font-extrabold disabled:opacity-60" style={{ background: GOLD, color: NAVY }}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}
