"use client";
// Add a vehicle by its VIN: snap a photo of it (windshield, door sticker or registration) or type it.
// The VIN is read as text and decoded, so the year, make, model and engine fill in by themselves.
import { useRef, useState } from "react";
import { shrink, type Decoded } from "@/components/VinPhoto";

const LINE = "#c8d0e0", NAVY = "#0d1b3e", MUTED = "#4a5878";

export default function VinSnap({ vin, onVin, onDecoded }: {
  vin: string; onVin: (v: string) => void; onDecoded: (d: Decoded, vin: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(""); const [ok, setOk] = useState(false);

  const show = (d: Decoded | null | undefined, v: string) => {
    if (d?.year || d?.make) { onDecoded(d!, v); setOk(true); setMsg(`${[d!.year, d!.make, d!.model, d!.engineL ? `${d!.engineL}L` : null].filter(Boolean).join(" ")}`); }
    else { setOk(false); setMsg("Got the VIN, but couldn't tell what car it is. Pick the year, make and model below."); }
  };

  async function photo(f: File | undefined) {
    if (!f) return;
    setBusy(true); setMsg(""); setOk(false);
    try {
      const image = await shrink(f);
      const r = await fetch("/api/os/photo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setMsg(j.error || "Couldn't read that photo. Try again or type the VIN.");
      else if (!j.vin) setMsg("Couldn't read all 17 characters. Try a closer, sharper photo, or type it.");
      else { onVin(j.vin); show(j.decoded, j.vin); }
    } catch { setMsg("Couldn't read that photo. Try again or type the VIN."); }
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  async function typed(v: string) {
    const clean = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17);
    onVin(clean); setOk(false); setMsg("");
    if (clean.length !== 17) return;
    setBusy(true);
    const j = await fetch(`/api/os/photo?vin=${clean}`).then((r) => r.json()).catch(() => ({ error: "Couldn't check that VIN." }));
    setBusy(false);
    if (j.error) setMsg(j.error); else show(j.decoded, clean);
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold">VIN <span className="font-normal" style={{ color: MUTED }}>(fills in the car for you)</span></span>
      <div className="flex gap-2">
        <button type="button" onClick={() => input.current?.click()} disabled={busy}
          className="h-12 px-4 rounded-xl font-bold text-white whitespace-nowrap flex items-center gap-2 disabled:opacity-60" style={{ background: NAVY }}>
          <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
          {busy ? "Reading…" : "Snap it"}
        </button>
        <input value={vin} onChange={(e) => typed(e.target.value)} placeholder="or type the VIN" maxLength={17} autoCapitalize="characters"
          className="h-12 flex-1 min-w-0 rounded-xl border px-3 font-mono text-[15px] bg-white" style={{ borderColor: LINE }} />
        <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => photo(e.target.files?.[0])} />
      </div>
      {msg && <p className="text-sm font-semibold" style={{ color: ok ? "#1d6b3a" : "#8a5a00" }}>{ok ? `✓ ${msg}` : msg}</p>}
      <p className="text-xs" style={{ color: MUTED }}>Bottom of the windshield on the driver&apos;s side, the driver&apos;s door sticker, or the registration.</p>
    </div>
  );
}
