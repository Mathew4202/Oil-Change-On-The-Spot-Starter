"use client";
// Optional: snap the VIN (bottom of the windshield, driver's side) or the sticker under the hood.
// The photo is shrunk on the phone first, then we keep it with the booking and try to read the VIN to find the exact engine.
import { useRef, useState } from "react";

export type VinResult = { photo: string; vin: string | null; engineL: string | null; decoded?: { year: number | null; make: string | null; model: string | null } | null };

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

export default function VinPhoto({ onResult, onClear, done }: { onResult: (r: VinResult) => void; onClear: () => void; done: VinResult | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [thumb, setThumb] = useState("");

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

  return (
    <div className="rounded-xl border border-dashed p-4 flex flex-col gap-2" style={{ borderColor: "#9aa6c0" }}>
      {!done ? (
        <>
          <p className="font-bold text-[16px]">Not sure of the engine? <span className="font-normal text-[#4a5878]">(optional)</span></p>
          <p className="text-sm text-[#4a5878]">Take a photo of your VIN, at the bottom of the windshield on the driver&apos;s side or on the door frame sticker. We&apos;ll match the exact engine.</p>
          <button type="button" onClick={() => input.current?.click()} disabled={busy}
            className="h-12 rounded-xl border-2 font-bold text-[16px] flex items-center justify-center gap-2 disabled:opacity-60" style={{ borderColor: "#0d1b3e" }}>
            <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
            {busy ? "Reading your photo…" : "Add a VIN photo"}
          </button>
          <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          {err && <p className="text-sm text-red-700" role="alert">{err}</p>}
        </>
      ) : (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {thumb && <img src={thumb} alt="Your VIN photo" className="w-16 h-16 rounded-lg object-cover shrink-0" />}
          <div className="flex-1 text-[15px]" aria-live="polite">
            {done.vin ? <><p className="font-bold">Got your VIN: <span className="font-mono">{done.vin}</span></p>
              <p className="text-sm text-[#4a5878]">{done.engineL ? `${done.engineL}L engine. ` : ""}We&apos;ll double-check it when we arrive.</p></>
              : <><p className="font-bold">Photo added</p><p className="text-sm text-[#4a5878]">We couldn&apos;t read the VIN, but we&apos;ll look at your photo before we come.</p></>}
          </div>
          <button type="button" onClick={() => { setThumb(""); onClear(); }} className="text-sm underline font-semibold shrink-0">Remove</button>
        </div>
      )}
    </div>
  );
}
