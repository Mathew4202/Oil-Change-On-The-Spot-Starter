"use client";
// One customer: call / text / book, when their next oil change is due, their cars, every job, texts, and their details.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import OwnerNav from "../../OwnerNav";
import { DUE_BADGE } from "../CustomersScreen";

const NAVY = "#0d1b3e", GOLD = "#f2b01e", LINE = "#c8d0e0", MUTED = "#4a5878", GOOD = "#1d6b3a";
type Detail = {
  customer: { id: string; firstName: string | null; lastName: string | null; name: string; phone: string | null; email: string | null; address: string | null; notes: string | null; smsOff: boolean; smsOffAt: string | null; smsOffBy: string | null; since: string; source: string | null; reviewAsked: boolean };
  stats: { visits: number; spent: number; average: number; lastVisit: string | null; nextDue: string | null; nextDueKm: number | null; due: string; cancelled: number; noShows: number };
  vehicles: { id: string; name: string; engine: string | null; vin: string | null; lastKm: number | null; oil: string | null; filter: string | null }[];
  upcoming: { id: string; date: string; at: string; status: string; total: number | null; job: string | null }[];
  jobs: { id: string; date: string; car: string | null; service: string | null; amount: number; tip: number; paidWith: string | null; receipt: string | null; receiptNo: number | null; fromSheet: boolean; km: number | null; oil: string | null; notes: string | null }[];
  texts: { kind: string | null; body: string | null; sent_at: string; status: string | null; channel: string | null; direction: string | null }[];
};
type Found = { id: string; first_name: string | null; last_name: string | null; phone: string | null; vehicles: { year: number | null; make: string | null; model: string | null }[] };

const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`;
const nice = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const time = (ts: string) => new Date(ts).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit", timeZone: "America/Halifax" });
const prettyPhone = (p: string) => { const d = p.replace(/\D/g, "").slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p; };
const PAID: Record<string, string> = { card_terminal: "Card", cash: "Cash", etransfer: "E-transfer", card_online: "Paid online", invoice: "Invoice" };
const SERVICE: Record<string, string> = { oil_change: "Oil change", seasonal: "Seasonal package", tires: "Tire change", parts: "Parts", diagnostic: "Diagnostic" };
const TEXT_KIND: Record<string, string> = { booking_confirmation: "Booking confirmed", day_before: "Day-before reminder", oil_due: "Oil change due", review: "Review ask",
  review_request: "Review ask", booking_moved: "Booking moved", booking_cancelled: "Booking cancelled", receipt: "Receipt" };
const field = "h-11 rounded-xl border px-3 text-base w-full bg-white";

export default function CustomerScreen({ id }: { id: string }) {
  const [d, setD] = useState<Detail | null>(null); const [err, setErr] = useState("");
  const load = useCallback(() => fetch(`/api/owner/customers?id=${id}`, { cache: "no-store" }).then((r) => r.json())
    .then((x) => (x.error ? setErr(x.error) : setD(x))).catch(() => setErr("Couldn't load. Check your connection.")), [id]);
  useEffect(() => { load(); }, [load]);

  if (!d) return (
    <Shell title="Customer"><p className="text-center py-8" style={{ color: err ? "#9b1c1c" : MUTED }}>{err || "Loading…"}</p></Shell>
  );
  const c = d.customer, s = d.stats;
  const badge = DUE_BADGE[s.due];
  const btn = "h-12 rounded-xl border font-bold flex items-center justify-center bg-white";
  return (
    <Shell title={c.name} sub={`Customer since ${nice(c.since)}`}>
      <div className="grid grid-cols-4 gap-2">
        {c.phone ? <a href={`tel:${c.phone}`} className={btn} style={{ borderColor: LINE }}>Call</a> : <span className={`${btn} opacity-40`} style={{ borderColor: LINE }}>Call</span>}
        {c.phone ? <a href={`sms:${c.phone}`} className={btn} style={{ borderColor: LINE }}>Text</a> : <span className={`${btn} opacity-40`} style={{ borderColor: LINE }}>Text</span>}
        {c.address ? <a href={`https://maps.google.com/?q=${encodeURIComponent(c.address)}`} target="_blank" rel="noreferrer" className={btn} style={{ borderColor: LINE }}>Map</a>
          : <span className={`${btn} opacity-40`} style={{ borderColor: LINE }}>Map</span>}
        <Link href={`/owner?book=${c.id}` as Route} className="h-12 rounded-xl font-extrabold flex items-center justify-center" style={{ background: GOLD, color: NAVY }}>Book</Link>
      </div>

      <section className="bg-white rounded-2xl p-4 flex flex-col gap-2">
        <h2 className="font-extrabold text-lg">Next oil change</h2>
        {badge ? <p className="rounded-xl px-3 py-2 font-bold" style={{ background: badge.bg, color: badge.fg }}>{badge.text({ nextDue: s.nextDue, nextBooking: d.upcoming[0]?.date ?? null })}</p>
          : s.nextDue ? <p className="font-bold">Due {nice(s.nextDue)}{s.nextDueKm ? ` or at ${s.nextDueKm.toLocaleString()} km` : ""}</p>
          : <p style={{ color: MUTED }}>Not known yet. It&apos;s worked out when a job is finished in HQ.</p>}
        {badge && s.nextDue && s.due !== "booked" && s.nextDueKm && <p className="text-sm" style={{ color: MUTED }}>Or at {s.nextDueKm.toLocaleString()} km, whichever comes first.</p>}
        {d.upcoming.map((b) => (
          <Link key={b.id} href={`/owner?date=${b.date}` as Route} className="flex justify-between text-[15px] py-1">
            <span><strong>{nice(b.date)}</strong> at {time(b.at)}{b.job ? ` · ${SERVICE[b.job] ?? b.job}` : ""}</span><span className="font-bold">{b.total ? money(Number(b.total)) : ""} ›</span>
          </Link>
        ))}
      </section>

      <section className="grid grid-cols-2 gap-2">
        <Stat label="Visits" value={String(s.visits)} />
        <Stat label="Spent (before HST)" value={money(s.spent)} />
        <Stat label="Average visit" value={s.visits ? money(s.average) : "–"} />
        <Stat label="Last visit" value={s.lastVisit ? nice(s.lastVisit) : "–"} />
      </section>
      {(s.cancelled > 0 || s.noShows > 0) && <p className="text-sm -mt-2" style={{ color: MUTED }}>{[s.cancelled ? `${s.cancelled} cancelled` : "", s.noShows ? `${s.noShows} no-show${s.noShows === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ")}</p>}

      <section className="bg-white rounded-2xl p-4 flex flex-col gap-2">
        <h2 className="font-extrabold text-lg">Cars</h2>
        {d.vehicles.length === 0 && <p style={{ color: MUTED }}>No car saved yet.</p>}
        {d.vehicles.map((v) => (
          <div key={v.id} className="rounded-xl p-3 bg-[#f4f6fa] text-[15px]">
            <p className="font-extrabold">{v.name}{v.engine ? ` · ${v.engine}` : ""}</p>
            {(v.oil || v.filter) && <p>{[v.oil ? `Oil: ${v.oil}` : "", v.filter ? `Filter: ${v.filter}` : ""].filter(Boolean).join(" · ")}</p>}
            {v.lastKm != null && <p style={{ color: MUTED }}>Last odometer: {v.lastKm.toLocaleString()} km</p>}
            {v.vin && <p className="font-mono text-sm" style={{ color: MUTED }}>VIN {v.vin}</p>}
          </div>
        ))}
      </section>

      <section className="bg-white rounded-2xl p-4 flex flex-col">
        <h2 className="font-extrabold text-lg mb-1">History</h2>
        {d.jobs.length === 0 && <p style={{ color: MUTED }}>No jobs yet.</p>}
        {d.jobs.map((j) => (
          <div key={j.id} className="py-2 border-t first:border-t-0 text-[15px]" style={{ borderColor: "#eef1f6" }}>
            <div className="flex justify-between gap-3">
              <p className="font-bold">{nice(j.date)}</p>
              <p className="font-extrabold whitespace-nowrap">{money(j.amount)}</p>
            </div>
            <p className="text-sm truncate" style={{ color: MUTED }}>{[SERVICE[j.service ?? ""] ?? j.service, j.car].filter(Boolean).join(" · ")}</p>
            <p className="text-xs mt-0.5" style={{ color: MUTED }}>
              {[j.paidWith ? PAID[j.paidWith] ?? j.paidWith : "", j.tip ? `incl. ${money(j.tip)} tip` : "", j.km ? `${j.km.toLocaleString()} km` : "", j.fromSheet ? "from Job Tracker" : ""].filter(Boolean).join(" · ")}
              {j.receipt && <> · <a href={j.receipt} target="_blank" rel="noreferrer" className="font-bold underline" style={{ color: NAVY }}>Receipt #{j.receiptNo}</a></>}
            </p>
            {j.notes && <p className="text-xs mt-0.5 italic" style={{ color: MUTED }}>{j.notes}</p>}
          </div>
        ))}
      </section>

      <Texts c={c} texts={d.texts} reload={load} />
      <Details c={c} reload={load} />
      <Merge c={c} />
    </Shell>
  );
}

function Shell({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col bg-[#eef1f6] text-[#0d1b3e] max-w-xl mx-auto">
      <header className="sticky top-0 z-10 text-white px-4 pt-[max(14px,env(safe-area-inset-top))] pb-4" style={{ background: NAVY }}>
        <Link href={"/owner/customers" as Route} className="text-sm font-semibold text-[#c9d3ea]">‹ Customers</Link>
        <h1 className="text-[28px] leading-tight font-extrabold mt-1" style={{ fontFamily: "var(--font-condensed)" }}>{title}</h1>
        {sub && <p className="text-sm text-[#c9d3ea]">{sub}</p>}
      </header>
      <main className="flex-1 p-4 flex flex-col gap-4 pb-28">{children}</main>
      <OwnerNav />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="bg-white rounded-2xl p-3"><p className="text-xs font-semibold" style={{ color: MUTED }}>{label}</p><p className="text-xl font-extrabold">{value}</p></div>;
}

async function save(id: string, body: Record<string, unknown>) {
  const r = await fetch("/api/owner/customers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) });
  return r.json().catch(() => ({ ok: false, error: "Couldn't save" }));
}

function Texts({ c, texts, reload }: { c: Detail["customer"]; texts: Detail["texts"]; reload: () => void }) {
  const [busy, setBusy] = useState(false);
  const on = !c.smsOff;
  return (
    <section className="bg-white rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-extrabold text-lg">Automatic texts</h2>
          <p className="text-sm" style={{ color: MUTED }}>{on ? "Booking texts, reminders, oil-due and review texts." : c.smsOffBy === "reply"
            ? `Off. They replied STOP${c.smsOffAt ? ` on ${new Date(c.smsOffAt).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "America/Halifax" })}` : ""}. Only turn it back on if they ask (or they can reply START).`
            : "Off. Nothing automatic gets sent to them."}</p>
        </div>
        <button role="switch" aria-checked={on} aria-label="Automatic texts" disabled={busy || !c.phone}
          onClick={async () => { setBusy(true); await save(c.id, { smsOff: on }); setBusy(false); reload(); }}
          className="relative w-14 h-8 rounded-full shrink-0 disabled:opacity-40" style={{ background: on ? GOOD : LINE }}>
          <span className="absolute top-1 w-6 h-6 rounded-full bg-white transition-all" style={{ left: on ? 28 : 4 }} />
        </button>
      </div>
      {!c.phone && <p className="text-sm" style={{ color: MUTED }}>Add a phone number below to text them.</p>}
      {texts.length > 0 && (
        <div className="flex flex-col">
          {texts.map((t, i) => (
            <div key={i} className="py-2 border-t text-sm" style={{ borderColor: "#eef1f6" }}>
              <p className="font-bold">{t.direction === "in" ? "They replied" : TEXT_KIND[t.kind ?? ""] ?? t.kind ?? "Message"} <span className="font-normal" style={{ color: MUTED }}>· {new Date(t.sent_at).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "America/Halifax" })}{t.status && !["sent", "received"].includes(t.status) ? ` · ${t.status === "not_set_up" ? "not sent (texting not set up)" : t.status === "opted_out" ? "not sent (texts off)" : "not sent"}` : ""}</span></p>
              {t.body && <p className="line-clamp-2" style={{ color: MUTED }}>{t.body}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Details({ c, reload }: { c: Detail["customer"]; reload: () => void }) {
  const [f, setF] = useState({ firstName: c.firstName ?? "", lastName: c.lastName ?? "", phone: c.phone ? prettyPhone(c.phone) : "", email: c.email ?? "", address: c.address ?? "", notes: c.notes ?? "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null); const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setF({ ...f, [k]: e.target.value }); setMsg(null); };
  const changed = f.firstName !== (c.firstName ?? "") || f.lastName !== (c.lastName ?? "") || f.phone.replace(/\D/g, "") !== (c.phone ?? "").replace(/\D/g, "").slice(-10)
    || f.email !== (c.email ?? "") || f.address !== (c.address ?? "") || f.notes !== (c.notes ?? "");
  return (
    <section className="bg-white rounded-2xl p-4 flex flex-col gap-3">
      <h2 className="font-extrabold text-lg">Details</h2>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-sm font-semibold">First name<input value={f.firstName} onChange={set("firstName")} className={field} style={{ borderColor: LINE }} /></label>
        <label className="flex flex-col gap-1 text-sm font-semibold">Last name<input value={f.lastName} onChange={set("lastName")} className={field} style={{ borderColor: LINE }} /></label>
      </div>
      <label className="flex flex-col gap-1 text-sm font-semibold">Phone<input value={f.phone} onChange={set("phone")} inputMode="tel" placeholder="(902) 555-1234" className={field} style={{ borderColor: LINE }} /></label>
      <label className="flex flex-col gap-1 text-sm font-semibold">Email<input value={f.email} onChange={set("email")} type="email" className={field} style={{ borderColor: LINE }} /></label>
      <label className="flex flex-col gap-1 text-sm font-semibold">Address<input value={f.address} onChange={set("address")} className={field} style={{ borderColor: LINE }} /></label>
      <label className="flex flex-col gap-1 text-sm font-semibold">Notes<textarea value={f.notes} onChange={set("notes")} rows={3} placeholder="Gate code, dog, likes a call before we arrive…" className="rounded-xl border p-3 text-base" style={{ borderColor: LINE }} /></label>
      {msg && <p className="rounded-xl p-3 text-sm font-semibold" style={msg.ok ? { background: "#dff3e6", color: GOOD } : { background: "#fde8e8", color: "#9b1c1c" }}>{msg.text}</p>}
      <button disabled={!changed || busy} onClick={async () => {
        setBusy(true); const r = await save(c.id, f); setBusy(false);
        if (r.ok) { setMsg({ ok: true, text: "Saved." }); reload(); } else setMsg({ ok: false, text: r.error || "Couldn't save" });
      }} className="h-12 rounded-xl font-extrabold disabled:opacity-40" style={{ background: NAVY, color: "#fff" }}>{busy ? "Saving…" : "Save changes"}</button>
    </section>
  );
}

function Merge({ c }: { c: Detail["customer"] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false); const [q, setQ] = useState(""); const [found, setFound] = useState<Found[]>([]);
  const [pick, setPick] = useState<Found | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  useEffect(() => {
    if (q.trim().length < 2) { setFound([]); return; }
    const t = setTimeout(() => fetch(`/api/owner/customers?q=${encodeURIComponent(q)}`).then((r) => r.json()).then((x) => setFound((x.customers || []).filter((f: Found) => f.id !== c.id))), 250);
    return () => clearTimeout(t);
  }, [q, c.id]);
  const nm = (f: Found) => [f.first_name, f.last_name].filter(Boolean).join(" ") || "No name";
  if (!open) return <button onClick={() => setOpen(true)} className="text-sm font-bold underline self-start" style={{ color: MUTED }}>Same person as someone else?</button>;
  return (
    <section className="bg-white rounded-2xl p-4 flex flex-col gap-3 border" style={{ borderColor: LINE }}>
      <h2 className="font-extrabold text-lg">Same person as…</h2>
      <p className="text-sm" style={{ color: MUTED }}>Find their other record. All of {c.name}&apos;s cars, bookings, jobs and texts move onto it, and this record is removed.</p>
      {!pick && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone" className={field} style={{ borderColor: LINE }} autoFocus />}
      {!pick && found.map((f) => (
        <button key={f.id} onClick={() => setPick(f)} className="text-left rounded-xl border p-3" style={{ borderColor: LINE }}>
          <p className="font-bold">{nm(f)}</p>
          <p className="text-sm" style={{ color: MUTED }}>{[f.phone ? prettyPhone(f.phone) : "No phone", f.vehicles?.map((v) => [v.year, v.make, v.model].filter(Boolean).join(" ")).join(", ")].filter(Boolean).join(" · ")}</p>
        </button>
      ))}
      {pick && (
        <div className="rounded-xl p-3 bg-[#fff6dd] flex flex-col gap-2">
          <p className="text-[15px]">Move everything from <strong>{c.name}</strong> onto <strong>{nm(pick)}</strong>? This can&apos;t be undone.</p>
          {err && <p className="text-sm font-semibold text-[#9b1c1c]">{err}</p>}
          <div className="flex gap-2">
            <button disabled={busy} onClick={async () => {
              setBusy(true); setErr("");
              const r = await fetch("/api/owner/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "merge", from: c.id, into: pick.id }) }).then((x) => x.json()).catch(() => ({ ok: false, error: "Couldn't merge" }));
              setBusy(false);
              if (r.ok) router.replace(`/owner/customers/${pick.id}` as Route); else setErr(r.error || "Couldn't merge");
            }} className="h-11 flex-1 rounded-lg font-extrabold disabled:opacity-50" style={{ background: NAVY, color: "#fff" }}>{busy ? "Merging…" : "Yes, merge"}</button>
            <button onClick={() => setPick(null)} className="h-11 px-4 rounded-lg border font-bold bg-white" style={{ borderColor: LINE }}>Back</button>
          </div>
        </div>
      )}
      <button onClick={() => { setOpen(false); setPick(null); setQ(""); }} className="text-sm font-bold underline self-start" style={{ color: MUTED }}>Cancel</button>
    </section>
  );
}
