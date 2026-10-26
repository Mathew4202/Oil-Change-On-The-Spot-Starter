"use client";
import { useState } from "react";
import Link from "next/link";
import { NAVY, GOLD, PHONE, PHONE_TEL } from "@/components/site/brand";

export default function FleetLogin() {
  const [contact, setContact] = useState(""); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false); const [err, setErr] = useState("");
  async function go(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    const r = await fetch("/api/os/fleet-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contact }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) return setErr(j.error || "That didn't work. Try again.");
    setSent(true);
  }
  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-4">
      {sent ? (
        <div className="rounded-2xl border-2 p-5 flex flex-col gap-2" style={{ borderColor: NAVY }}>
          <p className="font-extrabold text-[20px]">Check your email and texts</p>
          <p className="text-[16px] text-[#4a5878]">If that&apos;s on a fleet account, we just sent the link to the email and mobile number on your account. Open it to see your fleet page, and bookmark it so it&apos;s one click next time.</p>
          <button onClick={() => { setSent(false); setContact(""); }} className="self-start underline font-semibold">Try a different number or email</button>
        </div>
      ) : (
        <form onSubmit={go} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 font-semibold text-[15px]">Mobile number or email on your account
            <input value={contact} onChange={(e) => setContact(e.target.value)} autoComplete="username" placeholder="902-555-0123 or you@company.ca"
              className="h-[52px] rounded-xl border px-4 text-[17px] font-normal" style={{ borderColor: "#c8d0e0" }} />
          </label>
          {err && <p className="text-sm font-semibold text-[#9b1c1c]" role="alert">{err}</p>}
          <button disabled={busy || contact.trim().length < 5} className="h-[54px] rounded-xl font-extrabold text-[17px] disabled:opacity-50" style={{ background: GOLD, color: NAVY }}>{busy ? "Sending…" : "Send me my login link"}</button>
          <p className="text-sm text-[#4a5878]">No password. We send a private link to the email and mobile number on your account.</p>
        </form>
      )}
      <p className="text-[15px] text-[#4a5878]">Not a fleet customer yet? <Link href="/fleet-request" className="font-bold underline">Get fleet pricing</Link>. Questions? Call or text <a href={PHONE_TEL} className="font-bold underline">{PHONE}</a>.</p>
    </div>
  );
}
