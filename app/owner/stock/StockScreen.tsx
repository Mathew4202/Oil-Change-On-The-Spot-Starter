"use client";
// What's on the shelf, what the next 7 days need, and what to buy.
import { useEffect, useMemo, useState } from "react";
import OwnerNav from "../OwnerNav";

const NAVY = "#0d1b3e", GOLD = "#f2b01e", LINE = "#c8d0e0";
type Part = { id: string; part_number: string; brand: string | null; description: string | null; category: string | null; on_hand: number; unit: string | null; oil_grade: string | null; reorder_at: number | null };
type Buy = { kind: string; label: string; need: number; have: number; buy: number; unit: string };
const CAT: Record<string, string> = { oil: "Oil", oil_filter: "Oil filters", cabin_filter: "Cabin filters", engine_filter: "Engine air filters", wiper: "Wipers", battery: "Batteries" };

export default function StockScreen() {
  const [parts, setParts] = useState<Part[]>([]); const [toBuy, setToBuy] = useState<Buy[]>([]); const [count, setCount] = useState(0);
  const [q, setQ] = useState(""); const [showEmpty, setShowEmpty] = useState(false); const [loading, setLoading] = useState(true);
  const load = () => fetch("/api/owner/stock", { cache: "no-store" }).then((r) => r.json()).then((d) => { setParts(d.parts || []); setToBuy(d.toBuy || []); setCount(d.bookingsCounted || 0); setLoading(false); });
  useEffect(() => { load(); }, []);

  // Oil approvals (dexos, VW 508 00...) for cars we've done: the sheet never recorded them, so they're looked up once
  const [specs, setSpecs] = useState<{ total: number; left: number } | null>(null);
  const [filling, setFilling] = useState(false); const [specErr, setSpecErr] = useState("");
  useEffect(() => { fetch("/api/owner/specs", { cache: "no-store" }).then((r) => r.json()).then((d) => d.total != null && setSpecs(d)).catch(() => {}); }, []);
  async function fillSpecs() {
    setFilling(true); setSpecErr("");
    for (let i = 0; i < 40; i++) {
      const d = await fetch("/api/owner/specs", { method: "POST" }).then((r) => r.json()).catch(() => null);
      if (!d) { setSpecErr("Lost connection. Tap again to carry on."); break; }
      if (d.error) { setSpecErr(d.error); break; }
      setSpecs({ total: d.total, left: d.left });
      if (!d.left || !d.tried) break;
    }
    setFilling(false);
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
    <div className="min-h-dvh flex flex-col bg-[#eef1f6] text-[#0d1b3e] max-w-xl mx-auto">
      <header className="sticky top-0 z-10 text-white px-4 pt-[max(14px,env(safe-area-inset-top))] pb-4" style={{ background: NAVY }}>
        <p className="text-sm text-[#c9d3ea] font-semibold">Filters and oil</p>
        <h1 className="text-[30px] leading-none font-extrabold" style={{ fontFamily: "var(--font-condensed)" }}>Stock</h1>
      </header>
      <main className="flex-1 p-4 flex flex-col gap-4 pb-28">
        {loading && <p className="text-center text-[#4a5878] py-8">Loading…</p>}

        {specs && specs.left > 0 && (
          <section className="rounded-2xl p-4 flex flex-col gap-2 border bg-white" style={{ borderColor: LINE }}>
            <h2 className="font-extrabold text-lg">Oil approvals for cars we&apos;ve done</h2>
            <p className="text-sm text-[#4a5878]">{specs.total - specs.left} of {specs.total} have the oil approval (dexos, VW, MB). The rest get looked up once and saved, about 20 seconds per batch of 6. Our oil, litres and filters stay as we recorded them.</p>
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

        <div className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search part # or oil" className="h-11 flex-1 rounded-xl border px-3 bg-white" style={{ borderColor: LINE }} />
          <button onClick={() => setShowEmpty((s) => !s)} className="h-11 px-3 rounded-xl border bg-white text-sm font-bold" style={{ borderColor: LINE }}>{showEmpty ? "Hide empty" : "Show empty"}</button>
        </div>

        {!loading && groups.length === 0 && <p className="text-sm text-[#4a5878]">Nothing on the shelf yet. Snap your parts receipts and they&apos;ll show up here.</p>}
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
                    <span className="w-16 text-center font-extrabold" style={{ color: low ? "#9b1c1c" : NAVY }}>{Number(p.on_hand)}{p.unit === "L" ? " L" : ""}</span>
                    <button onClick={() => adjust(p, step)} aria-label={`One more ${p.part_number}`} className="w-10 h-10 rounded-lg border font-bold text-lg" style={{ borderColor: LINE }}>+</button>
                  </div>
                </div>
              );
            })}
          </section>
        ))}
        <p className="text-xs text-[#4a5878] text-center">Stock goes up when you save a receipt and down when you finish a job. Use − / + to fix a count.</p>
      </main>
      <OwnerNav />
    </div>
  );
}
