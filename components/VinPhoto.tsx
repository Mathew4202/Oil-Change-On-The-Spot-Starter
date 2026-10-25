"use client";
// Optional: snap the VIN (bottom of the windshield, driver's side) or type it.
// We read the VIN as text, look up what car it is, and match the exact engine. The photo is kept with the booking too.
import { useRef, useState } from "react";

export type Decoded = { year: number | null; make: string | null; model: string | null; engineL: string | null; fuel: string | null; cylinders?: string | null };
export type VinResult = { photo: string | null; vin: string | null; engineL: string | null; decoded?: Decoded | null };

export const decodedName = (d: Decoded | null | undefined) =>
  d ? [d.year, d.make, d.model, d.engineL ? `${d.engineL}L` : null, /diesel/i.test(d.fuel || "") ? "diesel" : null].filter(Boolean).join(" ") : "";

async function shrink(file: File): Promise<string> {
  const img = await createImageBitmap(file).catch(async () => {
    const url = URL.createObjectURL(file);
    const el = new Image(); el.src = url; await el.decode(); return el as unknown as ImageBitmap;
  });
  const max = 1600, k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.82);
}

export default function VinPhoto({ onResult, onClear, done, picked, onUseCar }: {
  onResult: (r: VinResult) => void; onClear: () => void; done: VinResult | null;
  picked: { year: string; make: string; model: string };          // the car chosen in the dropdowns
  onUseCar: (d: Decoded) => void;                                   // fill the dropdowns from the VIN
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [thumb, setThumb] = useState("");
  const [typing, setTyping] = useState(false); const [typed, setTyped] = useState("");

  async function pick(f: File | undefined) {
    if (!f) return;
    setErr(""); setBusy(true);
    try {
      const image = await shrink(f); setThumb(image);
      const r = await fetch("/api/os/photo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.photo) { setErr(j.error || "Couldn't add the photo. You can skip this."); setThumb(""); }
      else onResult(j);
    } catch { setErr("Couldn't open that photo. You can skip this."); setThumb(""); }
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  async function lookUp() {
    setErr(""); setBusy(true);
    const r = await fetch(`/api/os/photo?vin=${encodeURIComponent(typed)}`).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) return setErr(j.error || "Couldn't look that up. You can skip this.");
    onResult({ photo: null, vin: j.vin, engineL: j.engineL, decoded: j.decoded });
  }

  const d = done?.decoded;
  const name = decodedName(d);
  const differs = !!d?.year && !!d.make && (String(d.year) !== picked.year || d.make.toLowerCase() !== picked.make.toLowerCase()
    || (!!d.model && !!picked.model && !picked.model.toLowerCase().includes(d.model.toLowerCase()) && !d.model.toLowerCase().includes(picked.model.toLowerCase())));

  return (
    <div className="rounded-xl border border-dashed p-4 flex flex-col gap-2" style={{ borderColor: "#9aa6c0" }}>
      {!done ? (
        <>
          <p className="font-bold text-[16px]">Not sure of the engine? <span className="font-normal text-[#4a5878]">(optional)</span></p>
          <p className="text-sm text-[#4a5878]">Add your VIN. It&apos;s at the bottom of the windshield on the driver&apos;s side, or on the door frame sticker. We&apos;ll find your exact car and engine.</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => input.current?.click()} disabled={busy}
              className="h-12 rounded-xl border-2 font-bold text-[15px] flex items-center justify-center gap-2 disabled:opacity-60" style={{ borderColor: "#0d1b3e" }}>
              <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
              {busy && !typing ? "Reading…" : "Take a photo"}
            </button>
            <button type="button" onClick={() => setTyping((t) => !t)} aria-expanded={typing}
              className="h-12 rounded-xl border-2 font-bold text-[15px]" style={{ borderColor: "#0d1b3e" }}>Type it</button>
          </div>
          {typing && (
            <div className="flex gap-2">
              <input value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17))} placeholder="17 characters" autoCapitalize="characters"
                aria-label="VIN" className="flex-1 h-12 rounded-xl border px-3 font-mono tracking-wide text-[16px]" style={{ borderColor: "#c8d0e0" }} />
              <button type="button" onClick={lookUp} disabled={busy || typed.length !== 17} className="h-12 px-4 rounded-xl font-bold text-white disabled:opacity-50" style={{ background: "#0d1b3e" }}>{busy ? "…" : "Look up"}</button>
            </div>
          )}
          <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          {err && <p className="text-sm text-red-700" role="alert">{err}</p>}
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {thumb && <img src={thumb} alt="Your VIN photo" className="w-14 h-14 rounded-lg object-cover shrink-0" />}
            <div className="flex-1 text-[15px]" aria-live="polite">
              {done.vin ? <>
                <p className="font-bold">VIN <span className="font-mono">{done.vin}</span></p>
                <p className="text-[#0d1b3e]">{name ? <>This is a <strong>{name}</strong>.</> : "We'll match the engine from it."}</p>
              </> : <><p className="font-bold">Photo added</p><p className="text-sm text-[#4a5878]">We couldn&apos;t read the VIN, but we&apos;ll look at your photo before we come.</p></>}
            </div>
            <button type="button" onClick={() => { setThumb(""); setTyped(""); onClear(); }} className="text-sm underline font-semibold shrink-0">Remove</button>
          </div>
          {d && differs && (
            <div className="rounded-lg bg-[#fff6dd] p-3 flex flex-col gap-2 text-[15px]">
              <p>That&apos;s not the car picked above.</p>
              <button type="button" onClick={() => onUseCar(d)} className="h-11 rounded-lg font-bold text-white" style={{ background: "#0d1b3e" }}>Use the {name}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
