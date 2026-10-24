"use client";
// Money: profit for the week / month / year, HST to set aside, who still owes us, and the monthly bank statement check.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import OwnerNav from "../OwnerNav";

const NAVY = "#0d1b3e", GOLD = "#f2b01e", LINE = "#c8d0e0", MUTED = "#4a5878", GOOD = "#1d6b3a", BAD = "#9b1c1c";
type Kind = "week" | "month" | "year";
type Summary = { jobs: number; sales: number; hstCollected: number; spending: number; hstPaid: number; profit: number; hstOwing: number; avgJob: number; jobProfit: number; avgJobProfit: number;
  spendingByGroup: { group: string; name: string; amount: number }[]; doneBy: Record<string, number>; tips: number; jobsNoHst: number; expensesNoHst: number };
type Month = { month: string; sales: number; spending: number; profit: number };
type Data = { period: { kind: Kind; label: string; from: string; to: string; offset: number }; summary: Summary; months: Month[];
  unpaid: { id: string; date: string; name: string; amount: number }[]; bank: { needsLook: number; lastStatement: string | null; today: string } };
type BankLine = { id: string; account?: string; posted_on: string; amount: number; description: string; kind: string | null; category: string | null; note: string | null; status?: string; decided_by?: string | null };
type Upload = { ok: boolean; error?: string; account?: string; from?: string; to?: string; added?: number; skipped?: number; matched?: number; auto?: number; needsLook?: number };

const money = (n: number, cents = true) => `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-CA", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`;
const nice = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
const clean = (s: string) => s.replace(/^\[[A-Z]{2}\]\s*/, "");
const CATS: [string, string][] = [["fuel", "Gas"], ["parts", "Filters and parts"], ["oil", "Oil"], ["supply", "Supplies and tools"], ["software", "Phone and software"],
  ["insurance", "Insurance"], ["fees", "Bank and card fees"], ["marketing", "Marketing"], ["other", "Other"]];
const KIND_NAME: Record<string, string> = { receipt: "Receipt", napa_account: "NAPA account", payment: "Customer e-transfer", card_payout: "Card sales payout", bank_fee: "Bank fee",
  transfer: "Transfer", expense_no_receipt: "Added, no receipt", personal: "Not business", money_in: "Money in" };

export default function MoneyScreen() {
  const [kind, setKind] = useState<Kind>("month"); const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Data | null>(null); const [err, setErr] = useState("");
  const [bank, setBank] = useState<{ needsLook: BankLine[]; recent: BankLine[] }>({ needsLook: [], recent: [] });
  const [pick, setPick] = useState<number | null>(null);

  const load = useCallback(() => {
    fetch(`/api/owner/money?kind=${kind}&offset=${offset}`, { cache: "no-store" }).then((r) => r.json())
      .then((d) => { if (d.error) setErr(d.error); else { setData(d); setErr(""); } }).catch(() => setErr("Couldn't load. Check your connection."));
  }, [kind, offset]);
  const loadBank = useCallback(() => fetch("/api/owner/bank", { cache: "no-store" }).then((r) => r.json()).then((d) => setBank({ needsLook: d.needsLook || [], recent: d.recent || [] })).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadBank(); }, [loadBank]);
  useEffect(() => { setPick(null); }, [kind, offset]);

  const s = data?.summary;
  return (
    <div className="min-h-dvh flex flex-col bg-[#eef1f6] text-[#0d1b3e] max-w-xl mx-auto">
      <header className="sticky top-0 z-10 text-white px-4 pt-[max(14px,env(safe-area-inset-top))] pb-3" style={{ background: NAVY }}>
        <p className="text-sm text-[#c9d3ea] font-semibold">Profit, HST and the bank</p>
        <h1 className="text-[30px] leading-none font-extrabold" style={{ fontFamily: "var(--font-condensed)" }}>Money</h1>
        <div className="mt-3 grid grid-cols-3 gap-1 bg-white/10 rounded-xl p-1" role="tablist" aria-label="Time period">
          {(["week", "month", "year"] as Kind[]).map((k) => (
            <button key={k} role="tab" aria-selected={kind === k} onClick={() => { setKind(k); setOffset(0); }}
              className="h-9 rounded-lg text-sm font-bold capitalize" style={kind === k ? { background: GOLD, color: NAVY } : { color: "#fff" }}>{k}</button>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <button onClick={() => setOffset((o) => o - 1)} aria-label="Earlier" className="w-11 h-10 rounded-lg text-2xl font-bold">‹</button>
          <p className="font-extrabold text-lg">{data?.period.label ?? " "}</p>
          <button onClick={() => setOffset((o) => Math.min(0, o + 1))} disabled={offset === 0} aria-label="Later" className="w-11 h-10 rounded-lg text-2xl font-bold disabled:opacity-30">›</button>
        </div>
      </header>

      <main className="flex-1 p-4 flex flex-col gap-4 pb-28">
        {err && <p className="rounded-xl p-3 bg-[#fde8e8] text-[#9b1c1c] font-semibold">{err}</p>}
        {!data && !err && <p className="text-center text-[#4a5878] py-8">Loading…</p>}

        {s && data && (
          <>
            <section className="bg-white rounded-2xl p-4 flex flex-col gap-3">
              <div>
                <p className="text-sm font-semibold" style={{ color: MUTED }}>Profit</p>
                <p className="text-[44px] leading-none font-extrabold" style={{ fontFamily: "var(--font-condensed)", color: s.profit < 0 ? BAD : NAVY }}>{money(s.profit)}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl p-3 bg-[#f4f6fa]"><p className="text-xs font-semibold" style={{ color: MUTED }}>Money in</p><p className="text-xl font-extrabold">{money(s.sales)}</p>{s.tips > 0 && <p className="text-xs" style={{ color: MUTED }}>incl. {money(s.tips)} tips</p>}</div>
                <div className="rounded-xl p-3 bg-[#f4f6fa]"><p className="text-xs font-semibold" style={{ color: MUTED }}>Money out</p><p className="text-xl font-extrabold">{money(s.spending)}</p></div>
              </div>
              <p className="text-sm" style={{ color: MUTED }}>
                {s.jobs ? <>{s.jobs} job{s.jobs === 1 ? "" : "s"} · {money(s.avgJob)} average · {money(s.avgJobProfit)} left per job after oil and parts</> : "No jobs in this period yet."}
              </p>
              {s.jobs > 0 && (s.doneBy.mathew > 0 || s.doneBy.harsh > 0) && (
                <p className="text-sm" style={{ color: MUTED }}>Done by: {[["mathew", "Mathew"], ["harsh", "Harsh"], ["both", "both of you"]].filter(([k]) => s.doneBy[k]).map(([k, n]) => `${n} ${s.doneBy[k]}`).join(", ")}</p>
              )}
              <p className="text-xs" style={{ color: MUTED }}>All amounts before HST. Money out is everything spent: receipts, bank fees and lines added from the bank statement.</p>
            </section>

            <MonthChart months={data.months} year={data.period.from.slice(0, 4)} pick={pick} setPick={setPick} />

            {s.spendingByGroup.length > 0 && (
              <section className="bg-white rounded-2xl p-4 flex flex-col gap-2">
                <h2 className="font-extrabold text-lg">Where the money went</h2>
                {s.spendingByGroup.map((g) => (
                  <div key={g.group} className="flex flex-col gap-1">
                    <div className="flex justify-between text-[15px]"><span className="font-semibold">{g.name}</span><span className="font-bold">{money(g.amount)}</span></div>
                    <div className="h-2 rounded-full bg-[#eef1f6]"><div className="h-2 rounded-full" style={{ width: `${Math.max(2, (g.amount / s.spendingByGroup[0].amount) * 100)}%`, background: NAVY }} /></div>
                  </div>
                ))}
              </section>
            )}

            <section className="bg-white rounded-2xl p-4 flex flex-col gap-2">
              <h2 className="font-extrabold text-lg">HST</h2>
              <Row label="Collected from customers" value={money(s.hstCollected)} />
              <Row label="Paid on your receipts" value={`− ${money(s.hstPaid)}`} />
              <div className="border-t pt-2 flex justify-between items-baseline" style={{ borderColor: "#eef1f6" }}>
                <span className="font-bold">{s.hstOwing >= 0 ? "Set aside for CRA" : "CRA owes you back"}</span>
                <span className="text-xl font-extrabold">{money(Math.abs(s.hstOwing))}</span>
              </div>
              {(s.jobsNoHst > 0 || s.expensesNoHst > 0) && (
                <p className="text-xs rounded-lg p-2 bg-[#fff6dd]">
                  Not counted: {[s.jobsNoHst ? `${s.jobsNoHst} job${s.jobsNoHst === 1 ? "" : "s"}` : "", s.expensesNoHst ? `${s.expensesNoHst} expense${s.expensesNoHst === 1 ? "" : "s"}` : ""].filter(Boolean).join(" and ")} from the old trackers, which didn&apos;t record HST. Jobs finished in HQ and snapped receipts always include it.
                </p>
              )}
              <p className="text-xs" style={{ color: MUTED }}>An estimate to plan with, not your filed return. You only get HST back on purchases you have a receipt for, so snap every receipt.</p>
            </section>

            {data.unpaid.length > 0 && (
              <section className="rounded-2xl p-4 flex flex-col gap-2 border" style={{ background: "#fff6dd", borderColor: GOLD }}>
                <h2 className="font-extrabold text-lg">Waiting on payment</h2>
                {data.unpaid.map((u) => (
                  <Link key={u.id} href={`/owner?date=${u.date}`} className="flex justify-between gap-3 text-[15px] py-1">
                    <span><span className="font-semibold">{u.name}</span> <span style={{ color: MUTED }}>· {nice(u.date)}</span></span>
                    <span className="font-bold whitespace-nowrap">{money(u.amount)} ›</span>
                  </Link>
                ))}
                <p className="text-xs" style={{ color: MUTED }}>Finished jobs with no payment entered. Tap one to open the job and mark it paid.</p>
              </section>
            )}

            <BankSection status={data.bank} lines={bank.needsLook} recent={bank.recent} reload={() => { loadBank(); load(); }} />
          </>
        )}
      </main>
      <OwnerNav />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-[15px]"><span style={{ color: MUTED }}>{label}</span><span className="font-bold">{value}</span></div>;
}

function MonthChart({ months, year, pick, setPick }: { months: Month[]; year: string; pick: number | null; setPick: (n: number | null) => void }) {
  const max = Math.max(1, ...months.map((m) => Math.abs(m.profit)));
  const hasNeg = months.some((m) => m.profit < 0);
  const H = 120, zero = hasNeg ? H / 2 : H;
  const scale = (hasNeg ? H / 2 : H) / max;
  const sel = pick != null ? months[pick] : null;
  if (months.every((m) => m.sales === 0 && m.spending === 0)) return null;
  return (
    <section className="bg-white rounded-2xl p-4 flex flex-col gap-3">
      <h2 className="font-extrabold text-lg">Profit by month, {year}</h2>
      <div className="relative" style={{ height: H }} role="img" aria-label={`Profit by month for ${year}`}>
        <div className="absolute inset-x-0 border-t" style={{ top: zero, borderColor: LINE }} />
        <div className="absolute inset-0 grid grid-cols-12 gap-[2px]">
          {months.map((m, i) => {
            const h = Math.abs(m.profit) * scale;
            const neg = m.profit < 0;
            return (
              <button key={m.month} onClick={() => setPick(pick === i ? null : i)} aria-label={`${m.month}: profit ${money(m.profit, false)}`}
                className="relative h-full" style={{ outline: pick === i ? `2px solid ${GOLD}` : undefined, borderRadius: 6 }}>
                {h > 0 && <span className="absolute left-1/2 -translate-x-1/2 w-[60%] max-w-[18px]" style={{
                  height: Math.max(2, h), background: neg ? BAD : NAVY, opacity: pick == null || pick === i ? 1 : 0.35,
                  ...(neg ? { top: zero, borderRadius: "0 0 4px 4px" } : { top: zero - Math.max(2, h), borderRadius: "4px 4px 0 0" }) }} />}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-12 gap-[2px] -mt-1">
        {months.map((m, i) => <span key={m.month} className="text-[10px] text-center font-semibold" style={{ color: pick === i ? NAVY : MUTED }}>{m.month.slice(0, 1)}</span>)}
      </div>
      <p className="text-sm min-h-[20px]" style={{ color: MUTED }}>
        {sel ? <><strong style={{ color: NAVY }}>{sel.month}:</strong> in {money(sel.sales, false)} · out {money(sel.spending, false)} · profit <strong style={{ color: sel.profit < 0 ? BAD : NAVY }}>{money(sel.profit, false)}</strong></>
          : "Tap a month to see its numbers."}
      </p>
    </section>
  );
}

function BankSection({ status, lines, recent, reload }: { status: Data["bank"]; lines: BankLine[]; recent: BankLine[]; reload: () => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false); const [res, setRes] = useState<Upload | null>(null); const [showDone, setShowDone] = useState(false);
  const daysSince = status.lastStatement ? Math.round((Date.parse(status.today) - Date.parse(status.lastStatement)) / 86400000) : null;

  async function upload(f: File) {
    setBusy(true); setRes(null);
    const dataUrl = await new Promise<string>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = bad; r.readAsDataURL(f); });
    const r = await fetch("/api/owner/bank", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file: dataUrl, name: f.name }) })
      .then((x) => x.json()).catch(() => ({ ok: false, error: "Upload failed. Check your connection." }));
    setRes(r.error ? { ok: false, error: r.error } : r); setBusy(false); if (file.current) file.current.value = ""; reload();
  }

  return (
    <section className="bg-white rounded-2xl p-4 flex flex-col gap-3">
      <div>
        <h2 className="font-extrabold text-lg">Bank statement check</h2>
        <p className="text-sm" style={{ color: MUTED }}>
          {status.lastStatement ? <>Checked up to <strong style={{ color: NAVY }}>{nice(status.lastStatement)}</strong>.{daysSince != null && daysSince > 35 ? " Time to upload the next one." : ""}</> : "No statement uploaded yet."}
          {" "}Once a month, upload your BMO statement. Every line gets matched to a receipt, a NAPA account bill or a customer payment, and anything without a receipt shows up here.
        </p>
      </div>
      <input ref={file} type="file" accept=".csv,.pdf,text/csv,application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      <button onClick={() => file.current?.click()} disabled={busy} className="h-12 rounded-xl font-extrabold disabled:opacity-60" style={{ background: GOLD, color: NAVY }}>
        {busy ? "Reading the statement…" : "Upload statement (CSV or PDF)"}
      </button>
      <p className="text-xs" style={{ color: MUTED }}>CSV is best: in BMO online banking open the account, pick the dates, and download the transactions as CSV. A PDF statement works too (the AI reads it, a few cents). Chequing and Mastercard both work. Uploading the same month twice won&apos;t double anything.</p>

      {res && (res.ok
        ? <p className="rounded-xl p-3 bg-[#dff3e6] text-[15px]"><strong>{res.account}, {nice(res.from!)} to {nice(res.to!)}.</strong> {res.added} new line{res.added === 1 ? "" : "s"}: {res.matched} matched, {res.auto} sorted on their own, {res.needsLook} need a look.{res.skipped ? ` ${res.skipped} were already in from before.` : ""}</p>
        : <p className="rounded-xl p-3 bg-[#fde8e8] text-[#9b1c1c] font-semibold">{res.error}</p>)}

      {lines.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="font-extrabold">Needs a look ({lines.length})</h3>
          {lines.map((l) => <LineCard key={l.id} l={l} done={reload} />)}
        </div>
      )}
      {lines.length === 0 && status.lastStatement && <p className="rounded-xl p-3 bg-[#dff3e6] font-semibold">Everything on the bank statement is sorted.</p>}

      {recent.length > 0 && (
        <div>
          <button onClick={() => setShowDone((x) => !x)} className="text-sm font-bold underline" style={{ color: NAVY }}>{showDone ? "Hide" : "Show"} sorted lines</button>
          {showDone && <div className="mt-2 flex flex-col">
            {recent.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-2 py-2 border-t text-sm" style={{ borderColor: "#eef1f6" }}>
                <div className="min-w-0"><p className="font-semibold truncate">{clean(l.description)}</p><p className="text-xs" style={{ color: MUTED }}>{nice(l.posted_on)} · {KIND_NAME[l.kind || ""] ?? l.kind}{l.note ? ` · ${l.note}` : ""}</p></div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-bold" style={{ color: l.amount > 0 ? GOOD : NAVY }}>{l.amount > 0 ? "+" : ""}{money(l.amount)}</span>
                  {l.status === "done" && <button onClick={async () => { await fetch("/api/owner/bank", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: l.id, action: "undo" }) }); reload(); }}
                    className="text-xs font-bold underline" style={{ color: MUTED }}>Undo</button>}
                </div>
              </div>
            ))}
          </div>}
        </div>
      )}
    </section>
  );
}

function LineCard({ l, done }: { l: BankLine; done: () => void }) {
  const out = l.amount < 0;
  const [adding, setAdding] = useState(false);
  const [cat, setCat] = useState(CATS.find(([k]) => k === l.category || (l.category === "supplies" && k === "supply") || (l.category === "phone" && k === "software") || (l.category === "bank_fees" && k === "fees"))?.[0] ?? "other");
  const [busy, setBusy] = useState(false);
  async function act(action: string) {
    setBusy(true);
    await fetch("/api/owner/bank", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: l.id, action, category: cat }) });
    setBusy(false); done();
  }
  const btn = "h-10 px-3 rounded-lg border text-sm font-bold bg-white disabled:opacity-50";
  return (
    <div className="rounded-xl border p-3 flex flex-col gap-2" style={{ borderColor: LINE }}>
      <div className="flex justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold truncate">{clean(l.description)}</p>
          <p className="text-xs" style={{ color: MUTED }}>{nice(l.posted_on)}{l.account ? ` · ${l.account}` : ""}</p>
        </div>
        <span className="font-extrabold whitespace-nowrap" style={{ color: out ? NAVY : GOOD }}>{out ? "" : "+"}{money(l.amount)}</span>
      </div>
      {l.note && <p className="text-xs" style={{ color: MUTED }}>{l.note}</p>}
      {out ? (
        adding ? (
          <div className="flex gap-2">
            <select value={cat} onChange={(e) => setCat(e.target.value)} className="h-10 flex-1 rounded-lg border px-2 bg-white text-sm" style={{ borderColor: LINE }} aria-label="What was it for">
              {CATS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select>
            <button disabled={busy} onClick={() => act("expense")} className="h-10 px-4 rounded-lg text-sm font-extrabold disabled:opacity-50" style={{ background: NAVY, color: "#fff" }}>Add</button>
            <button onClick={() => setAdding(false)} className={btn} style={{ borderColor: LINE }}>Back</button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Link href="/owner/receipt" className={`${btn} inline-flex items-center`} style={{ borderColor: GOLD, background: "#fff6dd" }}>Snap the receipt</Link>
            <button disabled={busy} onClick={() => setAdding(true)} className={btn} style={{ borderColor: LINE }}>No receipt, add it</button>
            <button disabled={busy} onClick={() => act("personal")} className={btn} style={{ borderColor: LINE }}>Not business</button>
          </div>
        )
      ) : (
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={() => act("ok")} className={btn} style={{ borderColor: LINE }}>That&apos;s fine</button>
          <button disabled={busy} onClick={() => act("personal")} className={btn} style={{ borderColor: LINE }}>Not business</button>
        </div>
      )}
    </div>
  );
}
