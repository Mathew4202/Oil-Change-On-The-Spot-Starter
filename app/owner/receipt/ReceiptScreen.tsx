"use client";
// Snap a receipt → check what was read → Save (expense + stock + prices).
import { useEffect, useRef, useState } from "react";
import OwnerNav from "../OwnerNav";

const NAVY = "#0d1b3e", GOLD = "#f2b01e", LINE = "#c8d0e0";
type Item = { description: string; partNumber: string | null; brand: string | null; qty: number; unitPrice: number; lineTotal: number; category: string; litresPerUnit: number | null; oilGrade: string | null };
type Scan = { vendor: string; supplier: string; date: string | null; invoiceNo: string | null; subtotal: number | null; hst: number | null; total: number; paidWith: string; category: string; items: Item[]; warnings: string[] };
type Exp = { id: string; vendor: string | null; description: string | null; total: number; spent_at: string; category: string | null; paid_with: string | null; added_by: string | null };
const CATS: [string, string][] = [["oil_filter", "Oil filter"], ["cabin_filter", "Cabin filter"], ["engine_filter", "Engine filter"], ["wiper", "Wipers"], ["battery", "Battery"], ["oil", "Oil"], ["fluid", "Fluid"], ["supply", "Supplies"], ["tool", "Tool"], ["fuel", "Gas"], ["other", "Other"]];
const PAID: [string, string][] = [["card", "Card"], ["cash", "Cash"], ["on_account", "On account"], ["etransfer", "E-transfer"], ["unknown", "Not sure"]];
const money = (n: number | null | undefined) => n == null ? "" : `$${Number(n).toFixed(2)}`;

async function shrink(file: File): Promise<string> {
  // Phone photos are huge: resize to max 1600 px JPEG so it uploads fast and stays readable
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}

export default function ReceiptScreen({ owner }: { owner: string }) {
  const camRef = useRef<HTMLInputElement>(null); const pickRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<"idle" | "reading" | "review" | "saving" | "done">("idle");
  const [preview, setPreview] = useState(""); const [scan, setScan] = useState<Scan | null>(null); const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [err, setErr] = useState(""); const [result, setResult] = useState<{ stock: string[]; prices: string[] } | null>(null);
  const [recent, setRecent] = useState<Exp[]>([]);

  const loadRecent = () => fetch("/api/owner/receipt").then((r) => r.json()).then((d) => setRecent(d.expenses || [])).catch(() => {});
  useEffect(() => { loadRecent(); }, []);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setErr(""); setStage("reading"); setResult(null);
    try {
      const dataUrl = await shrink(f); setPreview(dataUrl);
      const r = await fetch("/api/owner/receipt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "scan", image: dataUrl }) });
      const j = await r.json();
      if (!r.ok) { setErr(j.error || "Couldn't read it"); setStage("idle"); return; }
      setScan(j.scan); setPhotoPath(j.photoPath); setStage("review");
    } catch { setErr("Couldn't open that photo"); setStage("idle"); }
  }

  async function save() {
    if (!scan) return;
    setStage("saving"); setErr("");
    const r = await fetch("/api/owner/receipt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", scan, photoPath }) });
    const j = await r.json();
    if (!r.ok) { setErr(j.error || "Couldn't save"); setStage("review"); return; }
    setResult({ stock: j.stock, prices: j.prices }); setStage("done"); loadRecent();
  }

  const upd = (p: Partial<Scan>) => setScan((s) => s ? { ...s, ...p } : s);
  const updItem = (i: number, p: Partial<Item>) => setScan((s) => s ? { ...s, items: s.items.map((it, j) => j === i ? { ...it, ...p, lineTotal: Math.round(((p.qty ?? it.qty) * (p.unitPrice ?? it.unitPrice)) * 100) / 100 } : it) } : s);
  const field = "h-11 rounded-lg border px-2 text-base w-full bg-white";

  return (
    <div className="min-h-dvh flex flex-col bg-[#eef1f6] text-[#0d1b3e] max-w-xl mx-auto">
      <header className="sticky top-0 z-10 text-white px-4 pt-[max(14px,env(safe-area-inset-top))] pb-4" style={{ background: NAVY }}>
        <p className="text-sm text-[#c9d3ea] font-semibold">Expenses and stock</p>
        <h1 className="text-[30px] leading-none font-extrabold" style={{ fontFamily: "var(--font-condensed)" }}>Receipts</h1>
      </header>

      <main className="flex-1 p-4 flex flex-col gap-4 pb-28">
        <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        <input ref={pickRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />

        {(stage === "idle" || stage === "done") && (
          <div className="flex flex-col gap-2">
            <button onClick={() => camRef.current?.click()} className="h-16 rounded-2xl font-extrabold text-lg flex items-center justify-center gap-3" style={{ background: GOLD, color: NAVY }}>
              <svg aria-hidden width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l2-3h6l2 3h3v12H4z" /><circle cx="12" cy="13" r="4" /></svg>
              Snap a receipt
            </button>
            <button onClick={() => pickRef.current?.click()} className="h-12 rounded-xl border bg-white font-bold" style={{ borderColor: LINE }}>Choose a photo instead</button>
            <p className="text-sm text-[#4a5878]">Parts, oil, gas, supplies, anything for the business. Filters and oil go into stock, and their prices update for the pricing.</p>
          </div>
        )}
        {err && <p className="rounded-xl bg-red-50 text-red-800 p-3 text-sm" role="alert">{err}</p>}

        {stage === "reading" && (
          <div className="bg-white rounded-2xl p-4 flex gap-3 items-center">
            {preview && <img src={preview} alt="" className="w-16 h-20 object-cover rounded-lg" />}
            <p className="font-semibold">Reading the receipt… (about 10 seconds)</p>
          </div>
        )}

        {stage === "done" && result && (
          <div className="rounded-2xl p-4 flex flex-col gap-1" style={{ background: "#dff3e6", border: "1px solid #9fd3b2" }} role="status">
            <p className="font-bold text-[#1d6b3a]">Saved.</p>
            {result.stock.length > 0 && <p className="text-sm">Stock: {result.stock.join(", ")}</p>}
            {result.prices.length > 0 && <p className="text-sm">Prices updated: {result.prices.join(", ")}</p>}
          </div>
        )}

        {(stage === "review" || stage === "saving") && scan && (
          <section className="bg-white rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex gap-3 items-start">
              {preview && <img src={preview} alt="Receipt photo" className="w-20 h-28 object-cover rounded-lg border" style={{ borderColor: LINE }} />}
              <div className="flex-1 flex flex-col gap-2">
                <input value={scan.vendor} onChange={(e) => upd({ vendor: e.target.value })} className={`${field} font-bold`} style={{ borderColor: LINE }} aria-label="Store" />
                <input type="date" value={scan.date ?? ""} onChange={(e) => upd({ date: e.target.value })} className={field} style={{ borderColor: LINE }} aria-label="Date" />
              </div>
            </div>
            {scan.warnings.length > 0 && <p className="text-sm rounded-lg bg-[#fff6dd] p-2">Check: {scan.warnings.join(". ")}.</p>}

            <div className="flex flex-col gap-2">
              {scan.items.map((it, i) => (
                <div key={i} className="rounded-xl border p-2 flex flex-col gap-2" style={{ borderColor: LINE }}>
                  <div className="flex justify-between gap-2"><span className="font-semibold text-sm">{it.description}</span><span className="font-bold text-sm whitespace-nowrap">{money(it.lineTotal)}</span></div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <select value={it.category} onChange={(e) => updItem(i, { category: e.target.value })} className={field} style={{ borderColor: LINE }} aria-label="Type">
                      {CATS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
                    </select>
                    {it.category === "oil"
                      ? <input value={it.oilGrade ?? ""} onChange={(e) => updItem(i, { oilGrade: e.target.value.toUpperCase() })} placeholder="Grade, e.g. 0W-20" className={field} style={{ borderColor: LINE }} aria-label="Oil grade" />
                      : <input value={it.partNumber ?? ""} onChange={(e) => updItem(i, { partNumber: e.target.value.toUpperCase() || null })} placeholder="Part #" className={field} style={{ borderColor: LINE }} aria-label="Part number" />}
                    <label className="flex items-center gap-2 text-xs font-semibold text-[#4a5878]">Qty
                      <input value={it.qty} onChange={(e) => updItem(i, { qty: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} inputMode="decimal" className={field} style={{ borderColor: LINE }} /></label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-[#4a5878] whitespace-nowrap">Each $
                      <input value={it.unitPrice} onChange={(e) => updItem(i, { unitPrice: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} inputMode="decimal" className={field} style={{ borderColor: LINE }} /></label>
                  </div>
                  {it.category === "oil" && (
                    <label className="text-xs font-semibold flex items-center gap-2">Litres per jug
                      <input value={it.litresPerUnit ?? ""} onChange={(e) => updItem(i, { litresPerUnit: Number(e.target.value.replace(/[^\d.]/g, "")) || null })} inputMode="decimal" className="h-9 w-20 rounded-lg border px-2" style={{ borderColor: LINE }} />
                    </label>
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-1 text-[15px]">
              <div className="flex justify-between"><span className="text-[#4a5878]">Subtotal</span><span>{money(scan.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-[#4a5878]">HST</span><span>{money(scan.hst)}</span></div>
              <div className="flex justify-between font-extrabold text-lg"><span>Total</span><span>{money(scan.total)}</span></div>
            </div>
            <p className="text-sm font-semibold">Paid with</p>
            <div className="flex flex-wrap gap-2">{PAID.map(([k, n]) => (
              <button key={k} onClick={() => upd({ paidWith: k })} className="h-10 px-3 rounded-full border text-sm font-bold"
                style={{ background: scan.paidWith === k ? NAVY : "#fff", color: scan.paidWith === k ? "#fff" : NAVY, borderColor: scan.paidWith === k ? NAVY : LINE }}>{n}</button>
            ))}</div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button onClick={() => { setStage("idle"); setScan(null); }} className="h-12 rounded-xl border font-bold" style={{ borderColor: LINE }}>Retake</button>
              <button onClick={save} disabled={stage === "saving"} className="h-12 rounded-xl font-extrabold disabled:opacity-60" style={{ background: GOLD, color: NAVY }}>{stage === "saving" ? "Saving…" : "Looks right, save"}</button>
            </div>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="font-extrabold text-lg mt-2">Recent</h2>
          {recent.length === 0 && <p className="text-sm text-[#4a5878]">No receipts yet.</p>}
          {recent.map((e) => (
            <div key={e.id} className="bg-white rounded-xl p-3 flex justify-between gap-3">
              <div className="min-w-0"><p className="font-bold truncate">{e.vendor || e.description || "Expense"}</p><p className="text-sm text-[#4a5878]">{e.spent_at} · {e.category || "other"}{e.paid_with === "on_account" ? " · on account" : ""}{e.added_by ? ` · ${e.added_by}` : ""}</p></div>
              <p className="font-bold whitespace-nowrap">{money(e.total)}</p>
            </div>
          ))}
        </section>
        <p className="text-xs text-center text-[#4a5878]">Signed in as {owner}</p>
      </main>
      <OwnerNav />
    </div>
  );
}
