"use client";
// Snap a receipt → check what was read → Save (expense + stock + prices).
import { useEffect, useRef, useState } from "react";
import OwnerNav from "../OwnerNav";

const NAVY = "#0d1b3e", GOLD = "#f2b01e", LINE = "#c8d0e0";
type Item = { description: string; partNumber: string | null; brand: string | null; qty: number; unitPrice: number; lineTotal: number; category: string; litresPerUnit: number | null; oilGrade: string | null; unitsPerPack?: number | null };
type Scan = { vendor: string; supplier: string; date: string | null; invoiceNo: string | null; subtotal: number | null; hst: number | null; total: number; paidWith: string; category: string; items: Item[]; warnings: string[] };
type Exp = { id: string; vendor: string | null; description: string | null; total: number; hst: number | null; spent_at: string; category: string | null; paid_with: string | null; added_by: string | null };
// what an expense counts as on the Money page
const EXP_CATS: [string, string][] = [["oil", "Oil"], ["parts", "Filters and parts"], ["fuel", "Gas"], ["supplies", "Supplies and tools"], ["software", "Phone and software"],
  ["insurance", "Insurance"], ["fees", "Bank and card fees"], ["marketing", "Marketing"], ["truck", "Truck repairs"], ["other", "Other"]];
const CATS: [string, string][] = [["oil_filter", "Oil filter"], ["cabin_filter", "Cabin filter"], ["engine_filter", "Engine filter"], ["wiper", "Wipers"], ["battery", "Battery"], ["oil", "Oil"], ["fluid", "Fluid"], ["gloves", "Gloves (boxes)"], ["shop_towels", "Shop towels"], ["supply", "Supplies"], ["tool", "Tool"], ["fuel", "Gas"], ["other", "Other"]];
const PAID: [string, string][] = [["card", "Card"], ["cash", "Cash"], ["on_account", "On account"], ["etransfer", "E-transfer"], ["unknown", "Not sure"]];
const money = (n: number | null | undefined) => n == null ? "" : `$${Number(n).toFixed(2)}`;

async function decode(file: File): Promise<{ img: CanvasImageSource; w: number; h: number }> {
  try { const b = await createImageBitmap(file); return { img: b, w: b.width, h: b.height }; }
  catch {   // some phones' photos (HEIC, very large) don't decode that way: let the browser load it as a picture instead
    const url = URL.createObjectURL(file);
    const im = new Image();
    await new Promise<void>((ok, bad) => { im.onload = () => ok(); im.onerror = () => bad(new Error("decode")); im.src = url; });
    return { img: im, w: im.naturalWidth, h: im.naturalHeight };
  }
}
async function shrink(file: File): Promise<string> {
  // Phone photos are huge: resize to max 1600 px JPEG so it uploads fast and stays readable
  const { img, w, h } = await decode(file);
  const scale = Math.min(1, 1600 / Math.max(w, h));
  const c = document.createElement("canvas"); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}

export default function ReceiptScreen({ owner }: { owner: string }) {
  const camRef = useRef<HTMLInputElement>(null); const pickRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<"idle" | "reading" | "review" | "saving" | "done">("idle");
  const [preview, setPreview] = useState(""); const [scan, setScan] = useState<Scan | null>(null); const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [err, setErr] = useState(""); const [result, setResult] = useState<{ stock: string[]; prices: string[]; unknown?: { part: string; category: string }[]; banked?: boolean; converted?: { usd: number; cad: number } | null } | null>(null);
  const [recent, setRecent] = useState<Exp[]>([]);
  const [editing, setEditing] = useState<string | null>(null);

  const loadRecent = () => fetch("/api/owner/receipt").then((r) => r.json()).then((d) => setRecent(d.expenses || [])).catch(() => {});
  useEffect(() => { loadRecent(); }, []);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setErr(""); setStage("reading"); setResult(null);
    let dataUrl = "";
    try { dataUrl = await shrink(f); setPreview(dataUrl); }
    catch { setErr("Couldn't open that photo. Try taking it again, or pick it with \"Choose a photo instead\"."); setStage("idle"); return; }
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await fetch("/api/owner/receipt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "scan", image: dataUrl }) }).catch(() => null);
      if (!r) { setErr("No connection to HQ. Check your signal and try again."); setStage("idle"); return; }
      const j = await r.json().catch(() => null);
      if (j && r.ok) { setScan(j.scan); setPhotoPath(j.photoPath); setStage("review"); return; }
      if (j) { setErr(j.error || "Couldn't read it"); setStage("idle"); return; }
      if (attempt === 0 && r.status >= 500) continue;   // HQ timed out reading it: try once more
      setErr(r.status === 401 ? "You've been signed out. Sign in again and retry." : `HQ couldn't read it in time (error ${r.status}). Try again in a minute.`); setStage("idle"); return;
    }
  }

  async function save() {
    if (!scan) return;
    setStage("saving"); setErr("");
    const r = await fetch("/api/owner/receipt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", scan, photoPath }) });
    const j = await r.json();
    if (!r.ok) { setErr(j.error || "Couldn't save"); setStage("review"); return; }
    setResult({ stock: j.stock, prices: j.prices, unknown: j.unknown, banked: j.banked, converted: j.converted }); setStage("done"); loadRecent();
  }

  const upd = (p: Partial<Scan>) => setScan((s) => s ? { ...s, ...p } : s);
  const updItem = (i: number, p: Partial<Item>) => setScan((s) => s ? { ...s, items: s.items.map((it, j) => j === i ? { ...it, ...p, lineTotal: Math.round(((p.qty ?? it.qty) * (p.unitPrice ?? it.unitPrice)) * 100) / 100 } : it) } : s);
  const field = "h-11 rounded-lg border px-2 text-base w-full bg-white";

  return (
    <div className="min-h-dvh flex flex-col bg-[#eef1f6] text-[#0d1b3e] max-w-xl md:max-w-3xl lg:max-w-4xl mx-auto">
      <header className="sticky top-0 z-10 text-white px-4 pt-[max(14px,env(safe-area-inset-top))] pb-4" style={{ background: NAVY }}>
        <p className="text-sm text-[#c9d3ea] font-semibold">Expenses and stock</p>
        <h1 className="text-[30px] leading-none font-extrabold" style={{ fontFamily: "var(--font-condensed)" }}>Receipts</h1>
      </header>

      <div className="flex-1 p-4 flex flex-col gap-4 pb-28">
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
            {(result.unknown ?? []).map((u) => <SameAs key={u.part} part={u.part} category={u.category} />)}
            {result.banked && <p className="text-sm">Matched to its line on the bank statement.</p>}
            {result.converted && <p className="text-sm">It was in US dollars: saved as ${result.converted.cad.toFixed(2)} CAD (US${"$"}{result.converted.usd.toFixed(2)} at the Bank of Canada rate).</p>}
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
            {(() => {
              // a misread or old date puts it in another month, so it won't show in this month's Money
              const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Halifax" });
              if (!scan.date) return null;
              const days = Math.round((Date.parse(today) - Date.parse(scan.date)) / 86400000);
              if (days >= 0 && scan.date.slice(0, 7) === today.slice(0, 7)) return null;
              return <p className="text-sm font-semibold rounded-lg bg-[#fde2e1] p-2" style={{ color: "#9b1c1c" }}>
                {days < 0 ? `This is dated ${scan.date}, which is in the future.` : `This is dated ${scan.date}, so it counts in that month, not this one.`} If that&apos;s wrong, change the date above before saving.{" "}
                <button type="button" onClick={() => upd({ date: today })} className="underline">Use today</button></p>;
            })()}

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
                      <DecimalInput value={it.qty} onChange={(n) => updItem(i, { qty: n ?? 0 })} className={field} style={{ borderColor: LINE }} /></label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-[#4a5878] whitespace-nowrap">Each $
                      <DecimalInput value={it.unitPrice} onChange={(n) => updItem(i, { unitPrice: n ?? 0 })} className={field} style={{ borderColor: LINE }} /></label>
                  </div>
                  {it.category === "shop_towels" && (
                    <label className="text-xs font-semibold flex items-center gap-2">Towels in each pack or roll
                      <DecimalInput value={it.unitsPerPack ?? null} onChange={(n) => updItem(i, { unitsPerPack: n })} className="h-9 w-20 rounded-lg border px-2" style={{ borderColor: LINE }} />
                    </label>
                  )}
                  {it.category === "oil" && (
                    <label className="text-xs font-semibold flex items-center gap-2">Litres per jug
                      <DecimalInput value={it.litresPerUnit} onChange={(n) => updItem(i, { litresPerUnit: n })} className="h-9 w-20 rounded-lg border px-2" style={{ borderColor: LINE }} />
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
          {recent.length > 0 && <p className="text-sm text-[#4a5878]">Tap one to fix it (amount, US dollars, date, category) or delete it.</p>}
          {recent.map((e) => editing === e.id ? (
            <EditExpense key={e.id} e={e} onDone={() => { setEditing(null); loadRecent(); }} />
          ) : (
            <button key={e.id} onClick={() => setEditing(e.id)} className="bg-white rounded-xl p-3 flex justify-between gap-3 text-left w-full">
              <div className="min-w-0"><p className="font-bold truncate">{e.vendor || e.description || "Expense"}</p><p className="text-sm text-[#4a5878]">{e.spent_at} · {e.category || "other"}{e.paid_with === "on_account" ? " · on account" : ""}{e.added_by ? ` · ${e.added_by}` : ""}</p></div>
              <p className="font-bold whitespace-nowrap">{money(e.total)}</p>
            </button>
          ))}
        </section>
        <p className="text-xs text-center text-[#4a5878]">Signed in as {owner}</p>
      </div>
      <OwnerNav />
    </div>
  );
}

/** Fix a saved receipt. "It was in US dollars" turns the amounts into Canadian dollars at that day's Bank of Canada rate. */
function EditExpense({ e, onDone }: { e: Exp; onDone: () => void }) {
  const [f, setF] = useState({ vendor: e.vendor ?? "", description: e.description ?? "", spent_at: e.spent_at, total: Number(e.total) as number | null, hst: (e.hst == null ? 0 : Number(e.hst)) as number | null,
    category: EXP_CATS.some(([k]) => k === e.category) ? e.category! : (e.category === "gas" ? "fuel" : e.category === "tools" ? "supplies" : "other"), paid_with: e.paid_with ?? "unknown" });
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(""); const [sure, setSure] = useState(false);
  const [converted, setConverted] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const field = "h-11 rounded-lg border px-2 text-[15px] w-full bg-white";
  async function post(body: object) {
    setBusy(true); setMsg("");
    const r = await fetch("/api/owner/receipt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok || j.ok === false || j.error) { setMsg(j.error || "Something went wrong"); return null; }
    return j;
  }
  async function usd() {
    const j = await post({ action: "usd", date: f.spent_at });
    if (!j?.rate) return;
    setConverted(true);
    const r = (n: number | null) => (n == null ? null : Math.round(n * j.rate * 100) / 100);
    setMsg(`US$${(f.total ?? 0).toFixed(2)} = $${r(f.total)?.toFixed(2)} CAD at ${Number(j.rate).toFixed(4)} (Bank of Canada, ${f.spent_at}). Check it, then save.`);
    set({ total: r(f.total), hst: r(f.hst), description: f.description.includes("US$") ? f.description : `${f.description}${f.description ? " " : ""}(US$${(f.total ?? 0).toFixed(2)})` });
  }
  return (
    <div className="bg-white rounded-xl p-3 flex flex-col gap-2 border-2" style={{ borderColor: NAVY }}>
      <label className="text-xs font-semibold flex flex-col gap-0.5">From<input value={f.vendor} onChange={(x) => set({ vendor: x.target.value })} className={field} style={{ borderColor: LINE }} /></label>
      <label className="text-xs font-semibold flex flex-col gap-0.5">What it was<input value={f.description} onChange={(x) => set({ description: x.target.value })} className={field} style={{ borderColor: LINE }} /></label>
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs font-semibold flex flex-col gap-0.5">Date<input type="date" value={f.spent_at} onChange={(x) => set({ spent_at: x.target.value })} className={field} style={{ borderColor: LINE }} /></label>
        <label className="text-xs font-semibold flex flex-col gap-0.5">Total (CAD)<DecimalInput value={f.total} onChange={(n) => set({ total: n })} className={field} style={{ borderColor: LINE }} /></label>
        <label className="text-xs font-semibold flex flex-col gap-0.5">HST in it<DecimalInput value={f.hst} onChange={(n) => set({ hst: n })} className={field} style={{ borderColor: LINE }} /></label>
      </div>
      <button type="button" onClick={usd} disabled={busy || converted} className="h-10 rounded-lg border font-bold text-sm disabled:opacity-60" style={{ borderColor: LINE }}>{converted ? "Converted to CAD" : "It was in US dollars: convert to CAD"}</button>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs font-semibold flex flex-col gap-0.5">Counts as<select value={f.category} onChange={(x) => set({ category: x.target.value })} className={field} style={{ borderColor: LINE }}>{EXP_CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="text-xs font-semibold flex flex-col gap-0.5">Paid with<select value={f.paid_with} onChange={(x) => set({ paid_with: x.target.value })} className={field} style={{ borderColor: LINE }}>{PAID.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      </div>
      <p className="text-xs text-[#4a5878]">US companies (Quo, software) usually don&apos;t charge HST: leave it at 0 unless the invoice shows it.</p>
      {msg && <p className="text-sm font-semibold" role="status">{msg}</p>}
      <div className="grid grid-cols-3 gap-2">
        <button type="button" onClick={onDone} className="h-11 rounded-lg border font-bold" style={{ borderColor: LINE }}>Cancel</button>
        <button type="button" disabled={busy} onClick={async () => { if (!sure) { setSure(true); return; } if (await post({ action: "delete", id: e.id })) onDone(); }}
          className="h-11 rounded-lg border font-bold text-[#9b1c1c] disabled:opacity-60" style={{ borderColor: sure ? "#9b1c1c" : LINE }}>{sure ? "Tap again" : "Delete"}</button>
        <button type="button" disabled={busy || f.total == null} onClick={async () => { if (await post({ action: "edit", id: e.id, ...f })) onDone(); }}
          className="h-11 rounded-lg font-extrabold disabled:opacity-60" style={{ background: GOLD, color: NAVY }}>{busy ? "…" : "Save"}</button>
      </div>
    </div>
  );
}

/** A number box you can type decimals into ("4." stays "4." while you type 4.4). */
function DecimalInput({ value, onChange, className, style }: { value: number | null; onChange: (n: number | null) => void; className?: string; style?: React.CSSProperties }) {
  const [text, setText] = useState(value == null ? "" : String(value));
  useEffect(() => { if (Number(text) !== value && !(text === "" && value == null)) setText(value == null ? "" : String(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <input value={text} inputMode="decimal" className={className} style={style}
    onChange={(e) => { const t = e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1"); setText(t); onChange(t === "" || t === "." ? null : Number(t)); }} />;
}

const KIND: Record<string, string> = { oil_filter: "oil filter", cabin_filter: "cabin filter", engine_filter: "air filter" };
/** A filter no car of ours uses yet (another brand's number): link it to the number our cars use, like NAPA 27356. */
function SameAs({ part, category }: { part: string; category: string }) {
  const [to, setTo] = useState(""); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(""); const [done, setDone] = useState(false);
  async function link() {
    setBusy(true); setMsg("");
    const r = await fetch("/api/owner/stock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "link", from: part, to }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok || !j.ok) return setMsg(j.error || "Couldn't link it");
    setDone(true); setMsg(`Done. ${part} stays its own part in Stock, but cars that use ${j.to} count it too, and the Bring list will say "${j.to} or ${part}".`);
  }
  return (
    <div className="rounded-lg border p-2.5 flex flex-col gap-1.5 text-sm" style={{ borderColor: "#f2b01e", background: "#fff6dd" }}>
      <p><strong>{part}</strong> isn&apos;t a {KIND[category] ?? "part"} any of our cars use yet. If it&apos;s the same as one they use (a different brand of NAPA 27356, say), type that number. It stays as {part} in Stock, and the Bring list will say either one.</p>
      {!done && <div className="flex gap-2">
        <input value={to} onChange={(e) => setTo(e.target.value.toUpperCase())} placeholder="e.g. 27356" autoCapitalize="characters" className="h-10 flex-1 min-w-0 rounded-lg border border-[#c8d0e0] px-2 text-base bg-white font-mono" />
        <button disabled={busy || !to.trim()} onClick={link} className="h-10 px-3 rounded-lg font-extrabold disabled:opacity-60" style={{ background: "#0d1b3e", color: "#fff" }}>{busy ? "…" : "Same as"}</button>
      </div>}
      {msg && <p className={done ? "text-[#1d6b3a] font-semibold" : "text-[#9b1c1c] font-semibold"}>{msg}</p>}
    </div>
  );
}
