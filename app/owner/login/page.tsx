"use client";
// HQ sign in. Built as a normal username + password form so the phone offers to save the login
// (iPhone Passwords / Google Password Manager) and fills it in next time.
import { useEffect, useState } from "react";

const LAST = "ocots_owner_last";

export default function OwnerLogin() {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { try { const n = localStorage.getItem(LAST); if (n) setName(n); } catch { /* private mode */ } }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError("");
    const n = name.trim().toLowerCase();
    const res = await fetch("/api/owner/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: n, password, remember }) });
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error || "Could not sign in"); setBusy(false); return; }
    try { localStorage.setItem(LAST, n); } catch { /* private mode */ }
    // Chrome / Android: ask to save the login. iPhone offers it by itself when the page changes.
    try {
      const W = window as unknown as { PasswordCredential?: new (f: HTMLFormElement) => Credential };
      if (W.PasswordCredential && navigator.credentials) await navigator.credentials.store(new W.PasswordCredential(e.currentTarget));
    } catch { /* not supported: fine */ }
    window.location.href = "/owner";
  }

  return (
    <div className="min-h-dvh bg-[#0d1b3e] flex items-center justify-center px-4">
      <form onSubmit={submit} method="post" action="/api/owner/login" className="w-full max-w-sm bg-white rounded-2xl p-6 flex flex-col gap-4 shadow-xl">
        <div className="flex flex-col gap-1">
          <p className="text-[#c98a00] font-bold tracking-widest text-xs">OCOTS HQ</p>
          <h1 className="text-3xl font-extrabold text-[#0d1b3e]" style={{ fontFamily: "var(--font-condensed)" }}>Sign in</h1>
        </div>
        <label className="flex flex-col gap-1 text-sm font-semibold text-[#0d1b3e]">Name
          <input id="username" name="username" value={name} placeholder="Your first name" onChange={(e) => setName(e.target.value)} required autoComplete="username"
            autoCapitalize="none" autoCorrect="off" spellCheck={false} className="h-12 rounded-xl border border-[#c8d0e0] px-3 text-base font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-[#0d1b3e]">Password
          <span className="relative">
            <input id="password" name="password" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password"
              className="h-12 w-full rounded-xl border border-[#c8d0e0] px-3 pr-16 text-base font-normal" />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-sm font-bold underline px-2 py-1">{show ? "Hide" : "Show"}</button>
          </span>
        </label>
        <label className="flex items-center gap-3 text-[15px] text-[#0d1b3e] cursor-pointer">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="w-5 h-5" style={{ accentColor: "#0d1b3e" }} />
          Keep me signed in on this phone
        </label>
        {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
        <button disabled={busy} className="h-12 rounded-xl bg-[#f2b01e] text-[#0d1b3e] font-extrabold text-base disabled:opacity-60">
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-xs text-[#4a5878]">{remember ? "You stay signed in on this phone for a year. When your phone asks to save the password, tap Save." : "You'll be signed out after 12 hours. Use this on a phone that isn't yours."}</p>
      </form>
    </div>
  );
}
