"use client";
import { useState } from "react";

export default function OwnerLogin() {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const res = await fetch("/api/owner/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, password }) });
    if (res.ok) window.location.href = "/owner";
    else { setError((await res.json()).error || "Could not sign in"); setBusy(false); }
  }

  return (
    <div className="min-h-dvh bg-[#0d1b3e] flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl p-6 flex flex-col gap-4 shadow-xl">
        <div className="flex flex-col gap-1">
          <p className="text-[#c98a00] font-bold tracking-widest text-xs">OCOTS HQ</p>
          <h1 className="text-3xl font-extrabold text-[#0d1b3e]" style={{ fontFamily: "var(--font-condensed)" }}>Owner sign in</h1>
        </div>
        <label className="flex flex-col gap-1 text-sm font-semibold text-[#0d1b3e]">Name
          <select value={name} onChange={(e) => setName(e.target.value)} required
            className="h-12 rounded-xl border border-[#c8d0e0] px-3 text-base font-normal bg-white">
            <option value="">Choose</option><option value="mathew">Mathew</option><option value="harsh">Harsh</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-[#0d1b3e]">Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password"
            className="h-12 rounded-xl border border-[#c8d0e0] px-3 text-base font-normal" />
        </label>
        {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
        <button disabled={busy} className="h-12 rounded-xl bg-[#f2b01e] text-[#0d1b3e] font-extrabold text-base disabled:opacity-60">
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-xs text-[#4a5878]">You stay signed in on this phone for 60 days.</p>
      </form>
    </div>
  );
}
