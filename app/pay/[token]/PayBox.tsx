"use client";
// Tip (after the job only) and the Pay button. The card is typed on Converge's secure page, never on ours.
import { useState } from "react";

const NAVY = "#0d1b3e", GOLD = "#f2b01e", LINE = "#c8d0e0";

export default function PayBox({ token, due, allowTip }: { token: string; due: number; allowTip: boolean }) {
  const [tip, setTip] = useState(0); const [other, setOther] = useState(""); const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const t = typing ? Math.min(500, Math.max(0, Number(other) || 0)) : tip;
  const pct = (p: number) => Math.round(due * p);
  const choices = [0, pct(0.1), pct(0.15), pct(0.2)].filter((v, i, a) => a.indexOf(v) === i);
  const btn = (on: boolean) => ({ background: on ? NAVY : "#fff", color: on ? "#fff" : NAVY, borderColor: on ? NAVY : LINE });

  async function pay() {
    setBusy(true); setErr("");
    const r = await fetch("/api/os/pay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, tip: t }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.url) { window.location.href = j.url; return; }
    setBusy(false); setErr(j.error || "Couldn't open the payment page. Please try again.");
  }

  return (
    <div className="flex flex-col gap-3">
      {allowTip && (
        <div className="flex flex-col gap-2 rounded-xl p-3 bg-[#f4f6fa]">
          <p className="font-bold">Add a tip? <span className="font-normal text-[#4a5878]">Totally optional. It all goes to the guys who did your car.</span></p>
          <div className="grid grid-cols-5 gap-2">
            {choices.map((v) => <button key={v} type="button" onClick={() => { setTip(v); setTyping(false); }} className="h-11 rounded-lg border font-bold text-sm" style={btn(!typing && tip === v)}>{v === 0 ? "No" : `$${v}`}</button>)}
            <button type="button" onClick={() => setTyping(true)} className="h-11 rounded-lg border font-bold text-sm" style={btn(typing)}>Other</button>
          </div>
          {typing && <input value={other} onChange={(e) => setOther(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="Tip amount" aria-label="Tip amount" className="h-12 rounded-xl border px-3 text-base bg-white" style={{ borderColor: LINE }} />}
        </div>
      )}
      {err && <p className="text-sm text-red-700" role="alert">{err}</p>}
      <button onClick={pay} disabled={busy} className="h-14 rounded-xl font-extrabold text-[18px] disabled:opacity-60" style={{ background: GOLD, color: NAVY }}>
        {busy ? "Opening the secure page…" : `Pay $${(due + t).toFixed(2)}${t ? ` (incl. $${t.toFixed(2)} tip)` : ""}`}
      </button>
      <p className="text-xs text-center text-[#4a5878]">You type your card on Elavon&apos;s secure payment page. We never see your card number.</p>
    </div>
  );
}
