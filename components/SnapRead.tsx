"use client";
// A camera button that reads one thing off a photo (the odometer or the VIN) and fills the field.
import { useRef, useState } from "react";
import { shrink } from "@/components/VinPhoto";

export default function SnapRead({ kind, onRead, label = "Snap" }: { kind: "odometer" | "vin"; onRead: (r: { km?: number; vin?: string }) => void; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  async function go(f: File | undefined) {
    if (!f) return;
    setBusy(true); setMsg("");
    try {
      const image = await shrink(f);
      const r = await fetch("/api/owner/read-photo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, image }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setMsg(j.error || "Couldn't read that photo. Type it instead.");
      else onRead(j);
    } catch { setMsg("Couldn't read that photo. Type it instead."); }
    setBusy(false);
    if (input.current) input.current.value = "";
  }
  return (
    <>
      <button type="button" onClick={() => input.current?.click()} disabled={busy} aria-label={`${label}: take a photo of the ${kind === "vin" ? "VIN" : "odometer"}`}
        className="h-12 px-3 rounded-xl font-bold text-white whitespace-nowrap flex items-center gap-1.5 shrink-0 disabled:opacity-60" style={{ background: "#0d1b3e" }}>
        <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
        {busy ? "Reading…" : label}
      </button>
      <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => go(e.target.files?.[0])} />
      {msg && <span className="basis-full text-sm font-semibold text-[#8a5a00]" role="alert">{msg}</span>}
    </>
  );
}
