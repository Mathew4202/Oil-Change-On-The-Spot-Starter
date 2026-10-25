"use client";
// Fleets: every fleet account with what needs doing, plus fleet pricing requests from the website.
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import OwnerNav from "../OwnerNav";
import AccountForm, { type AccountIn } from "./AccountForm";

const NAVY = "#0d1b3e", LINE = "#c8d0e0", MUTED = "#4a5878";
type Acc = { id: string; business_name: string; contact_name: string | null; billing: string; via: string | null; vehicles: number; due: number; unbilled: number; unbilledTotal: number; owing: number };
type Req = { id: string; company: string; contact_name: string; phone: string; email: string | null; vehicles: number | null; vehicle_types: string | null; services: string[]; address: string | null; notes: string | null; status: string; created_at: string };
const money = (n: number) => `$${n.toFixed(2)}`;

export default function FleetsScreen() {
  const [data, setData] = useState<{ accounts: Acc[]; requests: Req[] } | null>(null); const [err, setErr] = useState("");
  const [form, setForm] = useState<AccountIn | null>(null);
  const load = () => fetch("/api/owner/fleet", { cache: "no-store" }).then((r) => r.json()).then((d) => (d.error ? setErr(d.error) : setData(d))).catch(() => setErr("Couldn't load. Check your connection."));
  useEffect(() => { load(); }, []);
  async function status(id: string, s: string) {
    await fetch("/api/owner/fleet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "request", requestId: id, status: s }) });
    load();
  }
  return (
    <div className="min-h-dvh flex flex-col bg-[#eef1f6] text-[#0d1b3e] max-w-xl mx-auto">
      <header className="sticky top-0 z-10 text-white px-4 pt-[max(14px,env(safe-area-inset-top))] pb-3 flex items-end justify-between gap-3" style={{ background: NAVY }}>
        <div>
          <Link href={"/owner/customers" as Route} className="text-sm text-[#c9d3ea] font-semibold no-underline">‹ Customers</Link>
          <h1 className="text-[30px] leading-none font-extrabold" style={{ fontFamily: "var(--font-condensed)" }}>Fleets</h1>
        </div>
        {!form && <button onClick={() => setForm({})} className="h-10 px-3 rounded-lg font-bold text-sm" style={{ background: "#f2b01e", color: NAVY }}>+ New account</button>}
      </header>
      <main className="flex-1 p-4 flex flex-col gap-3 pb-28">
        {err && <p className="text-red-700" role="alert">{err}</p>}
        {!data && !err && <p className="text-center py-10" style={{ color: MUTED }}>Loading…</p>}
        {form && <AccountForm start={form} onCancel={() => setForm(null)} onDone={(id) => { window.location.href = `/owner/fleets/${id}`; }} />}

        {data && data.requests.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="font-extrabold text-lg">Requests from the website</h2>
            {data.requests.map((r) => (
              <div key={r.id} className="bg-white rounded-2xl p-4 flex flex-col gap-2 border-2" style={{ borderColor: r.status === "new" ? "#f2b01e" : "transparent" }}>
                <div className="flex justify-between gap-2">
                  <p className="font-bold text-[17px]">{r.company}</p>
                  <span className="text-xs font-bold rounded-full px-2 py-1 self-start capitalize" style={{ background: "#eef1f6" }}>{r.status}</span>
                </div>
                <p className="text-[15px]">{r.contact_name} · <a href={`tel:${r.phone}`} className="font-semibold underline">{r.phone.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3")}</a>{r.email ? ` · ${r.email}` : ""}</p>
                <p className="text-sm" style={{ color: MUTED }}>{[r.vehicles ? `${r.vehicles} vehicles` : null, r.vehicle_types, r.services.length ? `Wants: ${r.services.join(", ")}` : null, r.address].filter(Boolean).join(" · ")}</p>
                {r.notes && <p className="text-sm" style={{ color: MUTED }}>&ldquo;{r.notes}&rdquo;</p>}
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setForm({ business_name: r.company, contact_name: r.contact_name, phone: r.phone, email: r.email, address: r.address, notes: r.notes, fromRequest: r.id })}
                    className="h-10 px-3 rounded-lg font-bold text-sm text-white" style={{ background: NAVY }}>Make it an account</button>
                  {r.status === "new" && <button onClick={() => status(r.id, "contacted")} className="h-10 px-3 rounded-lg border font-bold text-sm" style={{ borderColor: LINE }}>Contacted</button>}
                  {r.status !== "quoted" && <button onClick={() => status(r.id, "quoted")} className="h-10 px-3 rounded-lg border font-bold text-sm" style={{ borderColor: LINE }}>Price sent</button>}
                  <button onClick={() => status(r.id, "lost")} className="h-10 px-3 rounded-lg border font-bold text-sm" style={{ borderColor: LINE }}>Not interested</button>
                </div>
              </div>
            ))}
          </section>
        )}

        {data && (
          <section className="flex flex-col gap-2">
            <h2 className="font-extrabold text-lg">Accounts</h2>
            {data.accounts.length === 0 && <p className="bg-white rounded-2xl p-4" style={{ color: MUTED }}>No fleet accounts yet. Tap &ldquo;+ New account&rdquo; when a fleet says yes.</p>}
            {data.accounts.map((a) => (
              <Link key={a.id} href={`/owner/fleets/${a.id}` as Route} className="bg-white rounded-2xl p-4 flex flex-col gap-1 no-underline text-[#0d1b3e]">
                <div className="flex justify-between gap-2"><p className="font-bold text-[17px]">{a.business_name}</p><span className="font-bold" aria-hidden>›</span></div>
                <p className="text-sm" style={{ color: MUTED }}>{a.vehicles} vehicles · {a.billing === "per_job" ? "invoice each job" : "monthly invoice"}{a.via ? ` · via ${a.via}` : ""}</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {a.due > 0 && <span className="text-xs font-bold rounded-full px-2 py-1" style={{ background: "#fff6dd", color: "#8a5a00" }}>{a.due} due</span>}
                  {a.unbilled > 0 && <span className="text-xs font-bold rounded-full px-2 py-1" style={{ background: "#e6ecf8", color: NAVY }}>{a.unbilled} to invoice ({money(a.unbilledTotal)} + HST)</span>}
                  {a.owing > 0 && <span className="text-xs font-bold rounded-full px-2 py-1" style={{ background: "#fde2e1", color: "#9b1c1c" }}>{money(a.owing)} owing</span>}
                </div>
              </Link>
            ))}
          </section>
        )}
      </main>
      <OwnerNav />
    </div>
  );
}
