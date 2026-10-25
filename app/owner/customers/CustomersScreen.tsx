"use client";
// Everyone who's booked with us: search, who's due for an oil change, and who spends the most.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import OwnerNav from "../OwnerNav";
import { matches } from "@/lib/os/customer-summary";

const NAVY = "#0d1b3e", LINE = "#c8d0e0", MUTED = "#4a5878";
type C = { id: string; name: string; phone: string | null; email: string | null; address: string | null; smsOff: boolean; cars: string[];
  visits: number; spent: number; lastVisit: string | null; nextDue: string | null; nextBooking: string | null; due: "overdue" | "soon" | "booked" | "ok" | "none" };
type Filter = "all" | "due" | "booked" | "nophone";
type Sort = "name" | "recent" | "spent";

const money = (n: number) => `$${n.toLocaleString("en-CA", { maximumFractionDigits: 0 })}`;
const nice = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
export const DUE_BADGE: Record<string, { text: (c: { nextDue: string | null; nextBooking: string | null }) => string; bg: string; fg: string } | undefined> = {
  overdue: { text: (c) => `Oil change overdue since ${nice(c.nextDue!)}`, bg: "#fde2e1", fg: "#9b1c1c" },
  soon: { text: (c) => `Oil change due ${nice(c.nextDue!)}`, bg: "#fff6dd", fg: "#8a5a00" },
  booked: { text: (c) => `Booked ${nice(c.nextBooking!)}`, bg: "#dff3e6", fg: "#1d6b3a" },
};

export default function CustomersScreen() {
  const [all, setAll] = useState<C[] | null>(null); const [err, setErr] = useState("");
  const [q, setQ] = useState(""); const [filter, setFilter] = useState<Filter>("all"); const [sort, setSort] = useState<Sort>("name");
  useEffect(() => {
    fetch("/api/owner/customers?list=1", { cache: "no-store" }).then((r) => r.json())
      .then((d) => (d.error ? setErr(d.error) : setAll(d.customers))).catch(() => setErr("Couldn't load. Check your connection."));
  }, []);

  const counts = useMemo(() => ({
    due: all?.filter((c) => c.due === "overdue" || c.due === "soon").length ?? 0,
    booked: all?.filter((c) => c.due === "booked").length ?? 0,
    nophone: all?.filter((c) => !c.phone).length ?? 0,
  }), [all]);

  const shown = useMemo(() => {
    if (!all) return [];
    const f = all.filter((c) => matches(c, q) && (filter === "all" || (filter === "due" ? c.due === "overdue" || c.due === "soon" : filter === "booked" ? c.due === "booked" : !c.phone)));
    const by: Record<Sort, (a: C, b: C) => number> = {
      name: (a, b) => a.name.localeCompare(b.name),
      recent: (a, b) => (b.lastVisit ?? "").localeCompare(a.lastVisit ?? ""),
      spent: (a, b) => b.spent - a.spent,
    };
    if (filter === "due") return f.sort((a, b) => (a.nextDue ?? "").localeCompare(b.nextDue ?? ""));
    if (filter === "booked") return f.sort((a, b) => (a.nextBooking ?? "").localeCompare(b.nextBooking ?? ""));
    return f.sort(by[sort]);
  }, [all, q, filter, sort]);

  const chip = (on: boolean) => ({ background: on ? NAVY : "#fff", color: on ? "#fff" : NAVY, borderColor: on ? NAVY : LINE });
  return (
    <div className="min-h-dvh flex flex-col bg-[#eef1f6] text-[#0d1b3e] max-w-xl mx-auto">
      <header className="sticky top-0 z-10 text-white px-4 pt-[max(14px,env(safe-area-inset-top))] pb-3" style={{ background: NAVY }}>
        <p className="text-sm text-[#c9d3ea] font-semibold">{all ? `${all.length} customers` : " "}</p>
        <div className="flex items-end justify-between gap-3">
          <h1 className="text-[30px] leading-none font-extrabold" style={{ fontFamily: "var(--font-condensed)" }}>Customers</h1>
          <span className="flex gap-2"><Link href={"/owner/plans" as Route} className="h-9 px-3 rounded-lg border border-[#3b4d7a] font-bold text-sm flex items-center no-underline text-white">Plans ›</Link>
          <Link href={"/owner/fleets" as Route} className="h-9 px-3 rounded-lg border border-[#3b4d7a] font-bold text-sm flex items-center no-underline text-white">Fleets ›</Link></span>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Name, phone, email or car"
          aria-label="Search customers" className="mt-3 h-11 w-full rounded-xl px-3 text-[#0d1b3e] bg-white" />
      </header>

      <main className="flex-1 p-4 flex flex-col gap-3 pb-28">
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1" role="tablist" aria-label="Show">
          {([["all", "Everyone", null], ["due", "Due for oil", counts.due], ["booked", "Booked", counts.booked], ["nophone", "No phone", counts.nophone]] as [Filter, string, number | null][]).map(([k, n, c]) => (
            <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className="h-9 px-3 rounded-full border text-sm font-bold whitespace-nowrap" style={chip(filter === k)}>
              {n}{c != null && c > 0 ? ` · ${c}` : ""}
            </button>
          ))}
        </div>
        {filter === "all" && (
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: MUTED }}>{all ? `${shown.length} shown` : ""}</span>
            <label className="flex items-center gap-2 font-semibold">Sort
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-9 rounded-lg border px-2 bg-white" style={{ borderColor: LINE }}>
                <option value="name">A to Z</option><option value="recent">Last visit</option><option value="spent">Most spent</option>
              </select>
            </label>
          </div>
        )}
        {filter === "due" && <p className="text-sm" style={{ color: MUTED }}>Due in the next 2 weeks or overdue, with nothing booked yet. They get an automatic text 3 days before, but a call works too.</p>}
        {filter === "nophone" && <p className="text-sm" style={{ color: MUTED }}>Mostly from the old Job Tracker. If one is a repeat of someone with a phone, open it and use &quot;Same person as…&quot;.</p>}

        {err && <p className="rounded-xl p-3 bg-[#fde8e8] text-[#9b1c1c] font-semibold">{err}</p>}
        {!all && !err && <p className="text-center py-8" style={{ color: MUTED }}>Loading…</p>}
        {all && shown.length === 0 && <p className="text-center py-8" style={{ color: MUTED }}>{q ? `No one matches "${q}".` : "No one here."}</p>}

        <ul className="flex flex-col gap-2">
          {shown.map((c) => {
            const badge = DUE_BADGE[c.due];
            return (
              <li key={c.id}>
                <Link href={`/owner/customers/${c.id}` as Route} className="block bg-white rounded-2xl p-3 active:bg-[#f4f6fa]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-extrabold text-[17px] truncate">{c.name}</p>
                      <p className="text-sm truncate" style={{ color: MUTED }}>{c.cars[0] ?? "No car saved"}{c.cars.length > 1 ? ` +${c.cars.length - 1}` : ""}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-extrabold">{c.visits ? money(c.spent) : ""}</p>
                      <p className="text-xs" style={{ color: MUTED }}>{c.visits ? `${c.visits} visit${c.visits === 1 ? "" : "s"}` : "No visits yet"}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                    {badge && <span className="rounded-full px-2 py-1" style={{ background: badge.bg, color: badge.fg }}>{badge.text(c)}</span>}
                    {c.lastVisit && <span className="rounded-full px-2 py-1 bg-[#eef1f6]" style={{ color: MUTED }}>Last visit {nice(c.lastVisit)}</span>}
                    {!c.phone && <span className="rounded-full px-2 py-1 bg-[#eef1f6]" style={{ color: MUTED }}>No phone</span>}
                    {c.smsOff && <span className="rounded-full px-2 py-1 bg-[#eef1f6]" style={{ color: MUTED }}>Texts off</span>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </main>
      <OwnerNav />
    </div>
  );
}
