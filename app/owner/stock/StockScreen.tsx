"use client";
// What's on the shelf, what the next 7 days need, and what to buy.
import { useEffect, useMemo, useState } from "react";
import OwnerNav from "../OwnerNav";
import { useRole } from "../RoleContext";

const NAVY = "#0d1b3e", GOLD = "#f2b01e", LINE = "#c8d0e0";
type Part = { id: string; part_number: string; brand: string | null; description: string | null; category: string | null; on_hand: number; unit: string | null; oil_grade: string | null; reorder_at: number | null };
type Buy = { kind: string; label: string; need: number; have: number; buy: number; unit: string };
const CAT: Record<string, string> = { oil: "Oil", oil_filter: "Oil filters", cabin_filter: "Cabin filters", engine_filter: "Engine air filters", wiper: "Wipers", battery: "Batteries", gloves: "Gloves (boxes)", shop_towels: "Shop towels" };

export default function StockScreen() {
  const { can } = useRole();
  const [parts, setParts] = useState<Part[]>([]); const [toBuy, setToBuy] = useState<Buy[]>([]); const [count, setCount] = useState(0);
  const [q, setQ] = useState(""); const [showEmpty, setShowEmpty] = useState(false); const [loading, setLoading] = useState(true);
  const load = () => fetch("/api/owner/stock", { cache: "no-store" }).then((r) => r.json()).then((d) => { setParts(d.parts || []); setToBuy(d.toBuy || []); setCount(d.bookingsCounted || 0); setLoading(false); });
  useEffect(() => { load(); }, []);

  // Oil approvals (dexos, VW 508 00...) for cars we've done: the sheet never recorded them, so they're looked up once
  const [specs, setSpecs] = useState<{ total: number; left: number } | null>(null);
  const [engines, setEngines] = useState<number | null>(null); const [loadingEngines, setLoadingEngines] = useState(false); const [engMsg, setEngMsg] = useState("");
  async function loadEngines() {
    setLoadingEngines(true); setEngMsg("");
    const d = await fetch("/api/owner/engines-import", { method: "POST" }).then((r) => r.json()).catch(() => ({ ok: false, error: "No answer. Try again." }));
    setLoadingEngines(false);
    if (d.ok) { setEngines(d.rows); setEngMsg(`Loaded ${Number(d.rows).toLocaleString()} engines.`); } else setEngMsg(d.error || "That didn't work.");
  }
  const [ai, setAi] = useState<{ paid: { spent: number; left: number; requests: number } | null; free: boolean } | null>(null);
  const [filling, setFilling] = useState(false); const [specErr, setSpecErr] = useState("");
  useEffect(() => { if (!can.settings) return; fetch("/api/owner/specs", { cache: "no-store" }).then((r) => r.json()).then((d) => { if (d.total != null) setSpecs(d); setEngines(d.engines ?? 0); setAi({ paid: d.paid ?? null, free: !!d.free }); }).catch(() => {}); }, [can.settings]);
  async function fillSpecs() {
    setFilling(true); setSpecErr("");
    for (let i = 0; i < 40; i++) {
      const d = await fetch("/api/owner/specs", { method: "POST" }).then((r) => r.json()).catch(() => null);
      if (!d) { setSpecErr("Lost connection. Tap again to carry on."); break; }
      if (d.error) { setSpecErr(d.error); break; }
      setSpecs({ total: d.total, left: d.left });
      if (d.note) { setSpecErr(d.note); break; }
      if (!d.left || !d.tried) break;
    }
    setFilling(false);
  }

  async function setCountTo(p: Part) {
    const v = window.prompt(`How many ${p.unit === "L" ? `litres of ${p.oil_grade}` : p.part_number} do you have?`, String(Number(p.on_hand)));
    if (v == null || v.trim() === "" || !Number.isFinite(Number(v)) || Number(v) < 0) return;
    await fetch("/api/owner/stock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ partId: p.id, setTo: Number(v) }) });
    load();
  }
  async function adjust(p: Part, delta: number) {
    setParts((ps) => ps.map((x) => x.id === p.id ? { ...x, on_hand: Math.max(0, Number(x.on_hand) + delta) } : x));
    await fetch("/api/owner/stock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ partId: p.id, delta }) });
  }

  const groups = useMemo(() => {
    const f = parts.filter((p) => (showEmpty || Number(p.on_hand) > 0) && (!q || `${p.part_number} ${p.brand} ${p.description} ${p.oil_grade}`.toLowerCase().includes(q.toLowerCase())));
    const g: Record<string, Part[]> = {};
    for (const p of f) (g[p.category || "other"] ||= []).push(p);
    return Object.entries(g).sort(([a], [b]) => (a === "oil" ? -1 : b === "oil" ? 1 : a.localeCompare(b)));
  }, [parts, q, showEmpty]);
  const buying = toBuy.filter((b) => b.buy > 0);

  return (
    <div className="min-h-dvh flex flex-col bg-[#eef1f6] text-[#0d1b3e] max-w-xl md:max-w-3xl lg:max-w-4xl mx-auto">
      <header className="sticky top-0 z-10 text-white px-4 pt-[max(14px,env(safe-area-inset-top))] pb-4" style={{ background: NAVY }}>
        <p className="text-sm text-[#c9d3ea] font-semibold">Filters and oil</p>
        <h1 className="text-[30px] leading-none font-extrabold" style={{ fontFamily: "var(--font-condensed)" }}>Stock</h1>
      </header>
      <div className="flex-1 p-4 flex flex-col gap-4 pb-28">
        {loading && <p className="text-center text-[#4a5878] py-8">Loading…</p>}

        {engines != null && (engines < 1000 || engMsg) && (
          <section className="rounded-2xl p-4 flex flex-col gap-2 border bg-white" style={{ borderColor: LINE }}>
            <h2 className="font-extrabold text-lg">Engine list for every car</h2>
            <p className="text-sm text-[#4a5878]">Loads the engine sizes of every car since 1995 from the free US EPA list, so the engine dropdown fills in instantly on the website and in HQ. Takes about 30 seconds. Free.</p>
            {engines < 1000 && <button onClick={loadEngines} disabled={loadingEngines} className="h-12 rounded-xl font-bold text-white disabled:opacity-60" style={{ background: NAVY }}>{loadingEngines ? "Loading… about 30 seconds" : "Load the engine list"}</button>}
            {engMsg && <p className="text-sm font-semibold" style={{ color: engMsg.startsWith("Loaded") ? "#1d6b3a" : "#9b1c1c" }}>{engMsg}</p>}
          </section>
        )}
        {ai && (
          <p className="text-[13px] text-[#4a5878] px-1">AI: {ai.free ? "free Gemini first" : "free Gemini not set up"}{ai.paid ? ` · paid backup this month $${ai.paid.spent.toFixed(2)} (${ai.paid.requests} uses), $${ai.paid.left.toFixed(2)} left` : ""}</p>
        )}
        {specs && specs.left > 0 && (
          <section className="rounded-2xl p-4 flex flex-col gap-2 border bg-white" style={{ borderColor: LINE }}>
            <h2 className="font-extrabold text-lg">Oil approvals for cars we&apos;ve done</h2>
            <p className="text-sm text-[#4a5878]">{specs.total - specs.left} of {specs.total} have the oil approval (dexos, VW, MB). The rest get looked up once and saved (free), up to 25 cars a day. Our oil, litres and filters stay as we recorded them.</p>
            <button onClick={fillSpecs} disabled={filling} className="h-12 rounded-xl font-bold text-white disabled:opacity-60" style={{ background: NAVY }}>
              {filling ? `Looking up… ${specs.left} left` : `Fill in the ${specs.left} left`}</button>
            {specErr && <p className="text-sm font-semibold text-[#b3261e]">{specErr}</p>}
          </section>
        )}

        {!loading && (
          <section className="rounded-2xl p-4 flex flex-col gap-2 border" style={{ background: buying.length ? "#fff6dd" : "#dff3e6", borderColor: buying.length ? GOLD : "#9fd3b2" }}>
            <h2 className="font-extrabold text-lg">{buying.length ? "Buy for the next 7 days" : "You're covered for the next 7 days"}</h2>
            <p className="text-sm text-[#4a5878]">Based on {count} upcoming booking{count === 1 ? "" : "s"}.</p>
            {buying.map((b) => (
              <div key={b.label} className="flex justify-between gap-3 text-[15px]">
                <span className="font-semibold">{b.label}</span>
                <span className="whitespace-nowrap"><strong>buy {b.buy}{b.unit && ` ${b.unit}`}</strong> <span className="text-[#4a5878]">(need {b.need}, have {b.have})</span></span>
              </div>
            ))}
          </section>
        )}

        <AddStock onAdded={load} />

        <div className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search part # or oil" className="h-11 flex-1 rounded-xl border px-3 bg-white" style={{ borderColor: LINE }} />
          <button onClick={() => setShowEmpty((s) => !s)} className="h-11 px-3 rounded-xl border bg-white text-sm font-bold" style={{ borderColor: LINE }}>{showEmpty ? "Hide empty" : "Show empty"}</button>
        </div>

        {!loading && groups.length === 0 && <p className="text-sm text-[#4a5878]">Nothing on the shelf yet. Add what you have with the button above, or snap your parts receipts.</p>}
        {groups.map(([cat, ps]) => (
          <section key={cat} className="bg-white rounded-2xl p-3 flex flex-col gap-1">
            <h2 className="font-extrabold px-1">{CAT[cat] || "Other"}</h2>
            {ps.map((p) => {
              const low = p.reorder_at != null && Number(p.reorder_at) > 0 && Number(p.on_hand) <= Number(p.reorder_at);
              const step = p.unit === "L" ? 1 : 1;
              return (
                <div key={p.id} className="flex items-center justify-between gap-2 py-2 px-1 border-t first:border-t-0" style={{ borderColor: "#eef1f6" }}>
                  <div className="min-w-0">
                    <p className="font-bold truncate">{p.unit === "L" ? `${p.oil_grade ?? ""} oil` : p.part_number}</p>
                    <p className="text-xs text-[#4a5878] truncate">{p.brand}{low ? " · low" : ""}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => adjust(p, -step)} aria-label={`One less ${p.part_number}`} className="w-10 h-10 rounded-lg border font-bold text-lg" style={{ borderColor: LINE }}>−</button>
                    <button onClick={() => setCountTo(p)} aria-label={`Type the count for ${p.part_number}`} className="w-16 text-center font-extrabold underline decoration-dotted" style={{ color: low ? "#9b1c1c" : NAVY }}>{Number(p.on_hand)}{p.unit === "L" ? " L" : ""}</button>
                    <button onClick={() => adjust(p, step)} aria-label={`One more ${p.part_number}`} className="w-10 h-10 rounded-lg border font-bold text-lg" style={{ borderColor: LINE }}>+</button>
                  </div>
                </div>
              );
            })}
          </section>
        ))}
        <p className="text-xs text-[#4a5878] text-center">Stock goes up when you save a receipt and down when you finish a job. Use − / + to fix a count, or tap a count to type it.</p>
      </div>
      <OwnerNav />
    </div>
  );
}

/** Add stock by hand: what's already on the shelf, or bought without a receipt to snap. */
function AddStock({ onAdded }: { onAdded: () => void }) {
  const KINDS: [string, string][] = [["oil_filter", "Oil filter"], ["oil", "Oil"], ["cabin_filter", "Cabin filter"], ["engine_filter", "Engine air filter"], ["wiper", "Wiper"], ["battery", "Battery"], ["gloves", "Gloves (boxes)"], ["shop_towels", "Shop towels (count of towels)"], ["other", "Other"]];
  const [open, setOpen] = useState(false); const [kind, setKind] = useState("oil_filter");
  const [pn, setPn] = useState(""); const [grade, setGrade] = useState(""); const [brand, setBrand] = useState(""); const [qty, setQty] = useState(""); const [cost, setCost] = useState("");
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(""); const [ok, setOk] = useState(true);
  const field = "h-11 rounded-lg border px-2 text-base w-full bg-white";
  const oil = kind === "oil", supply = kind === "gloves" || kind === "shop_towels";
  if (!open) return <button onClick={() => { setOpen(true); setMsg(""); }} className="h-12 rounded-xl font-extrabold" style={{ background: GOLD, color: NAVY }}>+ Add stock</button>;
  async function save() {
    setBusy(true); setMsg("");
    const r = await fetch("/api/owner/stock", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", category: kind, partNumber: pn, oilGrade: grade, brand, qty: Number(qty), unitCost: cost === "" ? null : Number(cost) }) });
    const j = await r.json().catch(() => ({})); setBusy(false); setOk(!!j.ok);
    if (!j.ok) { setMsg(j.error || "Couldn't add it"); return; }
    setMsg(`Added. ${oil ? `${j.partNumber.replace("OIL-", "")} oil` : j.partNumber}: ${j.onHand}${oil ? " L" : ""} on hand now.`);
    setPn(""); setQty(""); setCost(""); onAdded();
  }
  return (
    <section className="bg-white rounded-2xl p-3 flex flex-col gap-2 border-2" style={{ borderColor: NAVY }}>
      <h2 className="font-extrabold text-lg">Add stock</h2>
      <label className="text-sm font-semibold flex flex-col gap-1">What
        <select value={kind} onChange={(e) => setKind(e.target.value)} className={field} style={{ borderColor: LINE }}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      {oil ? (
        <label className="text-sm font-semibold flex flex-col gap-1">Oil grade<input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="0W-20" autoCapitalize="characters" className={field} style={{ borderColor: LINE }} /></label>
      ) : supply ? null : (
        <label className="text-sm font-semibold flex flex-col gap-1">Part number<input value={pn} onChange={(e) => setPn(e.target.value)} placeholder="e.g. 27356" autoCapitalize="characters" className={field} style={{ borderColor: LINE }} /></label>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm font-semibold flex flex-col gap-1">{oil ? "Litres" : kind === "gloves" ? "Boxes" : kind === "shop_towels" ? "Towels" : "How many"}<input value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder={oil ? "e.g. 18.9" : "e.g. 6"} className={field} style={{ borderColor: LINE }} /></label>
        <label className="text-sm font-semibold flex flex-col gap-1">{oil ? "Cost per litre" : kind === "gloves" ? "Cost per box" : kind === "shop_towels" ? "Cost per towel" : "Cost each"} <span className="font-normal text-[#4a5878] text-xs">with HST, if you know</span>
          <input value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="optional" className={field} style={{ borderColor: LINE }} /></label>
      </div>
      <label className="text-sm font-semibold flex flex-col gap-1">Brand <span className="font-normal text-[#4a5878] text-xs">optional</span><input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder={oil ? "e.g. East Coast Lubricants" : "NAPA ProFormer"} className={field} style={{ borderColor: LINE }} /></label>
      {msg && <p className="text-sm font-semibold" style={{ color: ok ? "#1d6b3a" : "#9b1c1c" }} role="status">{msg}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setOpen(false)} className="h-11 rounded-lg border font-bold" style={{ borderColor: LINE }}>Done</button>
        <button onClick={save} disabled={busy || !qty || (oil ? !grade : !pn)} className="h-11 rounded-lg font-extrabold disabled:opacity-60" style={{ background: GOLD, color: NAVY }}>{busy ? "Adding…" : "Add"}</button>
      </div>
      <p className="text-xs text-[#4a5878]">Add one thing at a time; the form stays open for the next one. A cost you enter updates the prices HQ uses for quotes and profit.</p>
    </section>
  );
}
