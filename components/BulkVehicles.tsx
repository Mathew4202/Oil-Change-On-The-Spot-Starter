"use client";
// Add a whole fleet at once: take photos of their vehicle list (or of the VINs, several per photo is fine),
// or upload the list as a photo or PDF. Every vehicle found shows up below to check and edit before saving.
// Units without a number get the next free numbers; plates are filled in when the list has them.
import { useRef, useState } from "react";

const NAVY = "#0d1b3e", GOLD = "#f2b01e", LINE = "#c8d0e0", MUTED = "#4a5878";
export type BulkRow = { unit: string | null; plate: string | null; vin: string | null; year: number | null; make: string | null; model: string | null; engine: string | null; vinBad?: boolean; notes?: string | null };
type Scan = (file: string) => Promise<{ rows?: BulkRow[]; error?: string; existingVins?: string[]; existingPlates?: string[] }>;
type Save = (rows: BulkRow[]) => Promise<{ saved?: number; skipped?: { row: number; reason: string }[]; error?: string }>;

const cell = "h-11 rounded-lg border px-2 text-[15px] w-full bg-white min-w-0";

/** Photos are made smaller (lists need more detail than a single VIN, so a bit bigger than usual). PDFs go as they are. */
async function toDataUrl(f: File): Promise<string> {
  if (f.type === "application/pdf") {
    if (f.size > 3_500_000) throw new Error("That PDF is too big (over 3.5 MB). Take photos of the pages instead.");
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error("Couldn't open that file")); r.readAsDataURL(f); });
  }
  const img = await createImageBitmap(f).catch(async () => { const el = new Image(); el.src = URL.createObjectURL(f); await el.decode(); return el as unknown as ImageBitmap; });
  const max = 2400, k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}

export default function BulkVehicles({ scan, save, onDone, onCancel }: { scan: Scan; save: Save; onDone: (msg: string) => void; onCancel: () => void }) {
  const cam = useRef<HTMLInputElement>(null), file = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [have, setHave] = useState<string[]>([]); const [plates, setPlates] = useState<string[]>([]);
  const norm = (p: string | null) => (p || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const isDup = (r: BulkRow) => (!!r.vin && have.includes(r.vin)) || (!!r.plate && plates.some((p) => norm(p) === norm(r.plate)));
  const [busy, setBusy] = useState(""); const [err, setErr] = useState("");

  async function read(files: FileList | null) {
    if (!files?.length) return;
    setErr("");
    const list = Array.from(files).slice(0, 10);
    for (const [i, f] of list.entries()) {
      setBusy(list.length > 1 ? `Reading ${i + 1} of ${list.length}…` : "Reading…");
      try {
        const r = await scan(await toDataUrl(f));
        if (r.error && !r.rows?.length) { setErr(r.error); continue; }
        if (r.existingVins) setHave(r.existingVins);
        if (r.existingPlates) setPlates(r.existingPlates);
        setRows((cur) => {
          const vins = new Set(cur.map((x) => x.vin).filter(Boolean));
          const add = (r.rows ?? []).filter((x) => !x.vin || !vins.has(x.vin));
          // keep numbering going across several photos
          let n = Math.max(0, ...cur.map((x) => (x.unit && /^\d+$/.test(x.unit) ? Number(x.unit) : 0)));
          const used = new Set(cur.map((x) => x.unit));
          return [...cur, ...add.map((x) => (x.unit && used.has(x.unit) && /^\d+$/.test(x.unit) ? { ...x, unit: String(++n) } : x))];
        });
      } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't read that. Try again."); }
    }
    setBusy("");
    if (cam.current) cam.current.value = ""; if (file.current) file.current.value = "";
  }

  const set = (i: number, p: Partial<BulkRow>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const ready = rows.filter((r) => (r.vin && !r.vinBad) || (r.year && r.make && r.model));
  const dupes = rows.filter(isDup).length;

  async function saveAll() {
    setBusy("Saving…"); setErr("");
    // a VIN that didn't read cleanly isn't saved as the VIN (the car is still added from its year, make and model)
    const r = await save(rows.filter((x) => !isDup(x)).map((x) => (x.vinBad ? { ...x, vin: null, notes: x.vin ? `VIN to check: ${x.vin}` : null } : x)));
    setBusy("");
    if (r.error) return setErr(r.error);
    const skipped = r.skipped ?? [];
    if (skipped.length && !r.saved) return setErr(`Nothing saved: ${skipped[0].reason}`);
    onDone(`Saved ${r.saved} vehicle${r.saved === 1 ? "" : "s"}.${skipped.length ? ` ${skipped.length} skipped (${Array.from(new Set(skipped.map((s) => s.reason))).join(", ")}).` : ""}${dupes ? ` ${dupes} already on the account.` : ""}`);
  }

  return (
    <div className="bg-white rounded-2xl p-4 flex flex-col gap-3 border-2" style={{ borderColor: NAVY }}>
      <h3 className="font-extrabold text-lg">Add many vehicles</h3>
      <p className="text-sm" style={{ color: MUTED }}>Take a photo of the vehicle list (registration or insurance list, a spreadsheet on screen) or of the VINs. Several vehicles in one photo is fine, and you can take a few photos. Or upload the list.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => cam.current?.click()} disabled={!!busy} className="h-12 px-4 rounded-xl font-bold text-white flex items-center gap-2 disabled:opacity-60" style={{ background: NAVY }}>
          <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>Take photos
        </button>
        <button type="button" onClick={() => file.current?.click()} disabled={!!busy} className="h-12 px-4 rounded-xl border font-bold disabled:opacity-60" style={{ borderColor: LINE }}>Upload a photo or PDF</button>
        <input ref={cam} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => read(e.target.files)} />
        <input ref={file} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => read(e.target.files)} />
      </div>
      {busy && <p className="font-semibold" role="status">{busy}</p>}
      {err && <p className="text-sm font-semibold text-[#9b1c1c]" role="alert">{err}</p>}

      {rows.length > 0 && (
        <>
          <p className="font-bold">{rows.length} found. Check them, add unit numbers or plates, then save.</p>
          <div className="flex flex-col gap-2">
            {rows.map((r, i) => {
              const dup = isDup(r);
              return (
                <div key={i} className="rounded-xl border p-2 flex flex-col gap-2" style={{ borderColor: dup ? "#c8d0e0" : r.vinBad ? "#e0a400" : LINE, opacity: dup ? 0.6 : 1 }}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-[15px] truncate">{[r.year, r.make, r.model, r.engine].filter(Boolean).join(" ") || "Car not known yet"}</p>
                    <button type="button" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} aria-label="Remove this vehicle" className="h-9 w-9 rounded-lg border font-bold shrink-0" style={{ borderColor: LINE }}>×</button>
                  </div>
                  <div className="grid grid-cols-[72px_1fr] gap-2">
                    <label className="text-xs font-semibold flex flex-col gap-0.5">Unit #<input value={r.unit ?? ""} onChange={(e) => set(i, { unit: e.target.value || null })} className={cell} style={{ borderColor: LINE }} /></label>
                    <label className="text-xs font-semibold flex flex-col gap-0.5">Plate<input value={r.plate ?? ""} onChange={(e) => set(i, { plate: e.target.value.toUpperCase() || null })} placeholder="Add if you have it" className={cell} style={{ borderColor: LINE }} /></label>
                  </div>
                  <label className="text-xs font-semibold flex flex-col gap-0.5">VIN
                    <input value={r.vin ?? ""} onChange={(e) => set(i, { vin: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17) || null, vinBad: false })} className={`${cell} font-mono`} style={{ borderColor: r.vinBad ? "#e0a400" : LINE }} />
                  </label>
                  {r.vinBad && <p className="text-xs font-semibold text-[#8a5a00]">This VIN didn&apos;t read cleanly. Check it against the vehicle, or type the year, make and model below.</p>}
                  {dup && <p className="text-xs font-semibold" style={{ color: MUTED }}>Already on the account, it won&apos;t be added twice.</p>}
                  {(!r.year || !r.make || !r.model || r.vinBad) && (
                    <div className="grid grid-cols-[72px_1fr_1fr] gap-2">
                      <input value={r.year ?? ""} onChange={(e) => set(i, { year: Number(e.target.value.replace(/\D/g, "").slice(0, 4)) || null })} inputMode="numeric" placeholder="Year" aria-label="Year" className={cell} style={{ borderColor: LINE }} />
                      <input value={r.make ?? ""} onChange={(e) => set(i, { make: e.target.value || null })} placeholder="Make" aria-label="Make" className={cell} style={{ borderColor: LINE }} />
                      <input value={r.model ?? ""} onChange={(e) => set(i, { model: e.target.value || null })} placeholder="Model" aria-label="Model" className={cell} style={{ borderColor: LINE }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onCancel} className="h-12 rounded-xl border font-bold" style={{ borderColor: LINE }}>Cancel</button>
        <button type="button" onClick={saveAll} disabled={!!busy || !ready.length} className="h-12 rounded-xl font-extrabold disabled:opacity-50" style={{ background: GOLD, color: NAVY }}>
          {busy === "Saving…" ? "Saving…" : `Save ${ready.filter((r) => !isDup(r)).length || ""} vehicles`}
        </button>
      </div>
    </div>
  );
}
