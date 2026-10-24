"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import NewBooking from "./NewBooking";

type Job = {
  id: string; start: string; end: string; status: string; payMode: string; cars: number;
  name: string; phone: string | null; address: string | null; car: string; engine: string | null;
  oil: { grade: string; litres: number; filter: string | null; spec: string | null } | null;
  lines: { label: string; amount: number }[]; total: number | null; profit: number | null;
  notes: string | null; checks: string[]; imported: boolean; job?: string; addons?: string[];
};
type Day = {
  date: string; jobs: Job[]; timeOff: { id: string; starts_at: string; ends_at: string; reason: string | null }[];
  totals: { jobs: number; booked: number; profit: number };
  bring: { oil: { grade: string; litres: number }[]; filters: { part: string; qty: number; inStock: number }[] };
};
type Alert = { id: string; title: string; body: string | null; created_at: string; read_at: string | null; bookings: { starts_at: string } | null };

const TZ = "America/Halifax";
const NAVY = "#0d1b3e", GOLD = "#f2b01e", INK = "#4a5878";

const todayStr = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const addDays = (d: string, n: number) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-CA", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).replace(/\./g, "");
const dayLabel = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd, 12)).toLocaleDateString("en-CA", { timeZone: "UTC", weekday: "long", month: "short", day: "numeric" }); };
const shortDay = (d: string) => { const [y, m, dd] = d.split("-").map(Number); const x = new Date(Date.UTC(y, m - 1, dd, 12)); return { wd: x.toLocaleDateString("en-CA", { timeZone: "UTC", weekday: "short" }), n: dd }; };
const money = (n: number | null | undefined) => n == null ? "" : `$${n.toFixed(n % 1 ? 2 : 0)}`;
const ago = (iso: string) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };

export default function Calendar({ owner }: { owner: string }) {
  const [date, setDate] = useState(todayStr());
  const [day, setDay] = useState<Day | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unread, setUnread] = useState(0);
  const [showAlerts, setShowAlerts] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [booking, setBooking] = useState(false);

  const load = useCallback(async (d: string) => {
    setError("");
    const res = await fetch(`/api/owner/day?date=${d}`, { cache: "no-store" });
    if (res.status === 401) { window.location.href = "/owner/login"; return; }
    if (!res.ok) { setError("Couldn't load the calendar. Pull down to try again."); return; }
    setDay(await res.json());
  }, []);

  const loadAlerts = useCallback(async () => {
    const res = await fetch("/api/owner/alerts", { cache: "no-store" });
    if (!res.ok) return;
    const j = await res.json();
    setAlerts(j.alerts); setUnread(j.unread);
  }, []);

  useEffect(() => { setDay(null); load(date); }, [date, load]);
  useEffect(() => {
    loadAlerts();
    const t = setInterval(() => { loadAlerts(); load(date); }, 30000);   // new bookings show up within 30 s
    const onFocus = () => { loadAlerts(); load(date); };
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [date, load, loadAlerts]);

  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(date, i - 3)), [date]);
  const today = todayStr();

  async function openAlerts() {
    setShowAlerts(true);
    if (unread) { await fetch("/api/owner/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) }); setUnread(0); }
  }

  return (
    <div className="min-h-dvh flex flex-col bg-[#eef1f6] text-[#0d1b3e] max-w-xl mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-20 text-white px-4 pt-[max(14px,env(safe-area-inset-top))] pb-4 flex flex-col gap-3" style={{ background: NAVY }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <p className="text-sm text-[#c9d3ea] font-semibold">{dayLabel(date)}</p>
            <h1 className="text-[30px] leading-none font-extrabold" style={{ fontFamily: "var(--font-condensed)" }}>
              {date === today ? "Today" : date === addDays(today, 1) ? "Tomorrow" : date === addDays(today, -1) ? "Yesterday" : "Day view"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {date !== today && (
              <button onClick={() => setDate(today)} className="h-10 px-3 rounded-lg border border-[#3b4d7a] text-sm font-bold">Today</button>
            )}
            <button onClick={openAlerts} aria-label={`Alerts${unread ? `, ${unread} new` : ""}`} className="relative w-11 h-11 rounded-lg border border-[#3b4d7a] flex items-center justify-center">
              <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
              {unread > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full text-[12px] font-extrabold flex items-center justify-center" style={{ background: GOLD, color: NAVY }}>{unread}</span>}
            </button>
          </div>
        </div>

        {/* Week strip */}
        <div className="flex items-center gap-1">
          <button onClick={() => setDate(addDays(date, -7))} aria-label="Previous week" className="w-8 h-12 flex items-center justify-center text-[#c9d3ea]">‹</button>
          <div className="grid grid-cols-7 gap-1 flex-1">
            {week.map((d) => {
              const s = shortDay(d), sel = d === date;
              return (
                <button key={d} onClick={() => setDate(d)} className="h-12 rounded-lg flex flex-col items-center justify-center text-xs font-semibold"
                  style={{ background: sel ? GOLD : d === today ? "#142a5c" : "transparent", color: sel ? NAVY : "#fff" }}>
                  <span className="opacity-80">{s.wd}</span><span className="text-base font-extrabold">{s.n}</span>
                </button>
              );
            })}
          </div>
          <button onClick={() => setDate(addDays(date, 7))} aria-label="Next week" className="w-8 h-12 flex items-center justify-center text-[#c9d3ea]">›</button>
        </div>

        {/* Totals */}
        <div className="grid grid-cols-3 gap-2">
          {[["Jobs", String(day?.totals.jobs ?? "–")], ["Booked", day ? money(day.totals.booked) || "$0" : "–"], ["Est. profit", day ? money(day.totals.profit) || "$0" : "–"]].map(([k, v]) => (
            <div key={k} className="rounded-xl px-3 py-2" style={{ background: "#142a5c" }}>
              <p className="text-xs text-[#c9d3ea]">{k}</p><p className="text-[22px] font-extrabold leading-tight">{v}</p>
            </div>
          ))}
        </div>
      </header>

      <main className="flex-1 p-4 flex flex-col gap-3 pb-28">
        {error && <p className="rounded-xl bg-red-50 text-red-800 p-3 text-sm" role="alert">{error}</p>}
        {!day && !error && <p className="text-center text-[#4a5878] py-10">Loading…</p>}

        {day && (day.bring.oil.length > 0 || day.bring.filters.length > 0) && (
          <div className="rounded-xl p-3 text-[15px] leading-snug border" style={{ background: "#fff6dd", borderColor: GOLD }}>
            <strong>Bring {date === today ? "today" : "this day"}:</strong>{" "}
            {[...day.bring.oil.map((o) => `${o.litres} L ${o.grade}`),
              ...day.bring.filters.map((f) => `${f.qty} × filter ${f.part}${f.inStock >= f.qty ? " (in stock)" : " (buy)"}`)].join(", ")}
          </div>
        )}

        {day && day.jobs.length === 0 && day.timeOff.length === 0 && (
          <div className="text-center py-12 flex flex-col gap-1">
            <p className="text-lg font-bold">No jobs booked</p>
            <p className="text-[#4a5878] text-sm">New bookings show up here on their own.</p>
          </div>
        )}

        {day && [...day.timeOff.map((t) => ({ at: t.starts_at, off: t, job: null as Job | null })),
                 ...day.jobs.map((j) => ({ at: j.start, off: null, job: j }))]
          .sort((x, y) => x.at.localeCompare(y.at))
          .map(({ off: t, job }) => t ? (
          <div key={t.id} className="rounded-xl bg-white/70 border border-dashed border-[#c8d0e0] p-3 flex items-center justify-between gap-2">
            <div><p className="font-bold">{time(t.starts_at)} – {time(t.ends_at)}</p><p className="text-sm text-[#4a5878]">{t.reason || "Blocked"}</p></div>
            <button onClick={async () => { await fetch(`/api/owner/time-off?id=${t.id}`, { method: "DELETE" }); load(date); }}
              className="h-10 px-3 rounded-lg border border-[#c8d0e0] text-sm font-bold">Remove</button>
          </div>
        ) : ((j: Job) => {
          const expanded = open === j.id;
          const paid = j.payMode === "online";
          return (
            <article key={j.id} className="bg-white rounded-2xl p-4 flex flex-col gap-2.5 shadow-sm">
              <button onClick={() => setOpen(expanded ? null : j.id)} className="text-left flex flex-col gap-1.5" aria-expanded={expanded}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-2xl font-extrabold" style={{ fontFamily: "var(--font-condensed)" }}>{time(j.start)}</p>
                  <span className="text-[13px] font-bold px-2.5 py-1 rounded-full"
                    style={paid ? { background: "#dff3e6", color: "#1d6b3a" } : { background: "#eef1f6", color: INK }}>
                    {j.status === "done" ? "Done" : paid ? "Paid online" : "Pay after"}
                  </span>
                </div>
                <p className="font-bold text-[17px]">{j.name}{j.car ? ` · ${j.car}` : ""}{j.cars > 1 ? ` (${j.cars} cars)` : ""}</p>
                {j.job && j.job !== "oil_change" && (
                  <p className="text-[15px] font-semibold text-[#c98a00]">
                    {j.job === "diagnostic" ? "Diagnostic" : j.job === "tires" ? "Tire change (on rims)" : `Parts visit: ${(j.addons ?? []).map((a) => ({ wipers: "wipers", cabin_filter: "cabin filter", engine_filter: "engine air filter", battery: "battery" } as Record<string, string>)[a] ?? a).join(", ")}`}
                  </p>
                )}
                {(!j.job || j.job === "oil_change") && (j.addons ?? []).includes("tires") && <p className="text-[15px] font-semibold text-[#c98a00]">+ Tire change</p>}
                {j.oil && <p className="text-[15px] text-[#4a5878]">{j.oil.grade} · {j.oil.litres} L{j.oil.filter ? ` · filter ${j.oil.filter}` : ""}{j.oil.spec && !/^API/.test(j.oil.spec) ? ` · ${j.oil.spec}` : ""}</p>}
                {j.address && <p className="text-[15px] text-[#4a5878]">{j.address}</p>}
                {j.checks.length > 0 && <p className="text-[13px] font-semibold text-[#8a5a00] bg-[#fff6dd] rounded-lg px-2 py-1">{j.checks.join(" · ")}</p>}
              </button>

              {expanded && (
                <div className="border-t border-[#eef1f6] pt-2 flex flex-col gap-1 text-[15px]">
                  {j.lines.map((l, i) => <div key={i} className="flex justify-between gap-3"><span className="text-[#4a5878]">{l.label}</span><span>{money(l.amount)}</span></div>)}
                  {j.total != null && <div className="flex justify-between font-bold"><span>Total with HST</span><span>{money(j.total)}</span></div>}
                  {j.profit != null && <div className="flex justify-between text-[#1d6b3a] font-semibold"><span>Est. profit</span><span>{money(j.profit)}</span></div>}
                  {j.notes && <p className="text-[#4a5878] mt-1">Note: {j.notes}</p>}
                  {j.imported && <p className="text-xs text-[#4a5878] mt-1">Imported from Square</p>}
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <a href={j.address ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(j.address)}` : undefined}
                  className="h-11 rounded-lg border border-[#c8d0e0] flex items-center justify-center font-bold text-sm aria-disabled:opacity-40" aria-disabled={!j.address}>Directions</a>
                <a href={j.phone ? `tel:${j.phone}` : undefined} className="h-11 rounded-lg border border-[#c8d0e0] flex items-center justify-center font-bold text-sm aria-disabled:opacity-40" aria-disabled={!j.phone}>Call</a>
                <a href={j.phone ? `sms:${j.phone}` : undefined} className="h-11 rounded-lg flex items-center justify-center font-bold text-sm text-white aria-disabled:opacity-40" style={{ background: NAVY }} aria-disabled={!j.phone}>Text</a>
              </div>
            </article>
          );
        })(job!))}

        {day && (
          <button onClick={() => setBlocking(true)} className="h-12 rounded-xl border-2 border-dashed border-[#c8d0e0] text-[#4a5878] font-bold">
            + Block time on {shortDay(date).wd} {shortDay(date).n}
          </button>
        )}
      </main>

      {/* Bottom nav */}
      <nav aria-label="App sections" className="fixed bottom-0 inset-x-0 z-20 bg-white border-t border-[#dde3ee] pb-[max(14px,env(safe-area-inset-bottom))] pt-2">
        <div className="max-w-xl mx-auto grid grid-cols-5 gap-1 px-2">
          {[["Calendar", true], ["Customers", false], ["Receipt", false], ["Stock", false], ["Money", false]].map(([label, active]) => (
            <span key={label as string} className="flex flex-col items-center gap-1 py-1 text-[12px]" style={{ color: active ? NAVY : "#9aa6bf", fontWeight: active ? 800 : 600 }}>
              <span className="w-6 h-6 rounded-md" style={{ background: active ? GOLD : "#eef1f6" }} aria-hidden />
              {label as string}{!active && <span className="sr-only"> (coming soon)</span>}
            </span>
          ))}
        </div>
      </nav>

      {/* Alerts panel */}
      {showAlerts && (
        <div className="fixed inset-0 z-30 bg-black/40 flex justify-end" onClick={() => setShowAlerts(false)}>
          <div className="w-full max-w-md h-full bg-white flex flex-col" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Alerts">
            <div className="flex items-center justify-between p-4 text-white pt-[max(16px,env(safe-area-inset-top))]" style={{ background: NAVY }}>
              <h2 className="text-2xl font-extrabold" style={{ fontFamily: "var(--font-condensed)" }}>Alerts</h2>
              <button onClick={() => setShowAlerts(false)} className="h-10 px-3 rounded-lg border border-[#3b4d7a] font-bold text-sm">Close</button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
              {alerts.length === 0 && <p className="text-center text-[#4a5878] py-10">No alerts yet.</p>}
              {alerts.map((a) => (
                <button key={a.id} className="text-left rounded-xl border border-[#eef1f6] p-3 flex flex-col gap-0.5"
                  onClick={() => { if (a.bookings?.starts_at) { setDate(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(a.bookings.starts_at))); } setShowAlerts(false); }}>
                  <span className="flex justify-between gap-2"><span className="font-bold">{a.title}</span><span className="text-xs text-[#4a5878] whitespace-nowrap">{ago(a.created_at)}</span></span>
                  {a.body && <span className="text-sm text-[#4a5878]">{a.body}</span>}
                  {a.bookings?.starts_at && <span className="text-xs font-semibold text-[#c98a00]">{dayLabel(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(a.bookings.starts_at)))}</span>}
                </button>
              ))}
            </div>
            <button onClick={async () => { await fetch("/api/owner/logout", { method: "POST" }); window.location.href = "/owner/login"; }}
              className="m-3 h-11 rounded-lg border border-[#c8d0e0] text-sm font-bold text-[#4a5878]">Sign out ({owner})</button>
          </div>
        </div>
      )}

      {/* New booking (phone customers) */}
      {!booking && !showAlerts && !blocking && (
        <button onClick={() => setBooking(true)} aria-label="New booking"
          className="fixed z-20 right-4 bottom-[calc(84px+env(safe-area-inset-bottom))] h-14 px-5 rounded-full shadow-lg font-extrabold text-base flex items-center gap-2"
          style={{ background: GOLD, color: NAVY }}>
          <span className="text-2xl leading-none" aria-hidden>+</span> New booking
        </button>
      )}
      {booking && <NewBooking date={date} onClose={(d) => { setBooking(false); if (d) { if (d === date) load(date); else setDate(d); loadAlerts(); } }} />}

      {blocking && <BlockTime date={date} onClose={(saved) => { setBlocking(false); if (saved) load(date); }} />}
    </div>
  );
}

function BlockTime({ date, onClose }: { date: string; onClose: (saved: boolean) => void }) {
  const [from, setFrom] = useState("12:00");
  const [to, setTo] = useState("17:00");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  async function save() {
    const res = await fetch("/api/owner/time-off", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, from, to, reason }) });
    if (res.ok) onClose(true); else setErr((await res.json()).error || "Could not save");
  }
  return (
    <div className="fixed inset-0 z-30 bg-black/40 flex items-end sm:items-center justify-center" onClick={() => onClose(false)}>
      <div className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-5 flex flex-col gap-3 pb-[max(20px,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Block time">
        <h2 className="text-2xl font-extrabold" style={{ fontFamily: "var(--font-condensed)" }}>Block time · {dayLabel(date)}</h2>
        <p className="text-sm text-[#4a5878]">Customers won&apos;t be able to book this time.</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm font-semibold">From<input type="time" value={from} onChange={(e) => setFrom(e.target.value)} className="h-12 rounded-xl border border-[#c8d0e0] px-3 text-base" /></label>
          <label className="flex flex-col gap-1 text-sm font-semibold">To<input type="time" value={to} onChange={(e) => setTo(e.target.value)} className="h-12 rounded-xl border border-[#c8d0e0] px-3 text-base" /></label>
        </div>
        <label className="flex flex-col gap-1 text-sm font-semibold">Reason (optional)<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Day off, truck service…" className="h-12 rounded-xl border border-[#c8d0e0] px-3 text-base font-normal" /></label>
        <button onClick={() => { setFrom("00:00"); setTo("23:59"); }} className="h-11 rounded-lg border border-[#c8d0e0] font-bold text-sm">Whole day</button>
        {err && <p className="text-sm text-red-700" role="alert">{err}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => onClose(false)} className="h-12 rounded-xl border border-[#c8d0e0] font-bold">Cancel</button>
          <button onClick={save} className="h-12 rounded-xl font-extrabold" style={{ background: GOLD, color: NAVY }}>Save</button>
        </div>
      </div>
    </div>
  );
}
