"use client";
// Owners: make logins for staff. Each one only sees its own part of HQ.
import { useEffect, useState } from "react";
import Link from "next/link";
import OwnerNav from "../OwnerNav";

const NAVY = "#0d1b3e", GOLD = "#f2b01e", LINE = "#c8d0e0", MUTED = "#4a5878";
type Staff = { username: string; display_name: string; role: string; active: boolean; phone: string | null; last_login_at: string | null };
type RoleInfo = { name: string; blurb: string };
const STAFF_ROLES = ["front_desk", "technician", "manager", "accountant", "fleet_sales", "marketing", "trainee"] as const;
const field = "h-12 rounded-xl border px-3 text-base w-full bg-white";
const when = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "America/Halifax" }) : "never";

export default function TeamScreen() {
  const [list, setList] = useState<Staff[] | null>(null); const [owners, setOwners] = useState<string[]>([]);
  const [roles, setRoles] = useState<Record<string, RoleInfo>>({}); const [ready, setReady] = useState(true);
  const [err, setErr] = useState(""); const [shown, setShown] = useState<{ username: string; password: string; name: string } | null>(null);
  const [adding, setAdding] = useState(false); const [busy, setBusy] = useState(false);
  const [name, setName] = useState(""); const [username, setUsername] = useState(""); const [role, setRole] = useState<string>("front_desk"); const [pw, setPw] = useState("");

  const load = () => fetch("/api/owner/team", { cache: "no-store" }).then((r) => r.json()).then((j) => { setList(j.staff ?? []); setOwners(j.owners ?? []); setRoles(j.roles ?? {}); setReady(j.ready !== false); }).catch(() => setErr("Couldn't load the team"));
  useEffect(() => { load(); }, []);

  async function post(body: object) {
    setBusy(true); setErr("");
    const r = await fetch("/api/owner/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok || j.ok === false) { setErr(j.error || "Something went wrong"); return null; }
    load(); return j;
  }
  async function add() {
    const j = await post({ action: "add", name, username: username || undefined, role, password: pw || undefined });
    if (j) { setShown({ username: j.username, password: j.password, name }); setAdding(false); setName(""); setUsername(""); setPw(""); }
  }

  return (
    <div className="min-h-dvh bg-[#eef1f6] text-[#0d1b3e] max-w-xl mx-auto pb-28">
      <header className="sticky top-0 z-10 text-white px-4 pt-[max(14px,env(safe-area-inset-top))] pb-4" style={{ background: NAVY }}>
        <Link href="/owner/money" className="text-sm text-[#c9d3ea] font-semibold">‹ Money</Link>
        <h1 className="text-[30px] leading-none font-extrabold mt-1" style={{ fontFamily: "var(--font-condensed)" }}>Team logins</h1>
        <p className="text-sm text-[#c9d3ea] mt-1">Each person signs in with their own name and password and only sees their part.</p>
      </header>
      <div className="p-4 flex flex-col gap-3">
        {!ready && <p className="rounded-xl p-3 text-sm" style={{ background: "#fff6dd" }}>Run migration 0032 in Supabase first, then come back here.</p>}
        {err && <p className="rounded-xl bg-red-50 text-red-800 p-3 text-sm" role="alert">{err}</p>}

        {shown && (
          <section className="rounded-2xl p-4 flex flex-col gap-2" style={{ background: "#dff3e6", border: "1px solid #9fd3b2" }} role="status">
            <p className="font-extrabold text-lg">Login for {shown.name || shown.username}</p>
            <p className="text-[15px]">Name: <strong className="font-mono">{shown.username}</strong><br />Password: <strong className="font-mono select-all">{shown.password}</strong></p>
            <p className="text-sm" style={{ color: MUTED }}>Give these to them now: the password isn&apos;t shown again (you can always make a new one). They sign in at the HQ page, and their phone offers to save it.</p>
            <div className="flex gap-2">
              <button onClick={() => navigator.clipboard?.writeText(`HQ login\nName: ${shown.username}\nPassword: ${shown.password}\n${window.location.origin}/owner/login`).catch(() => {})} className="h-11 px-4 rounded-lg font-bold text-white" style={{ background: NAVY }}>Copy</button>
              <button onClick={() => setShown(null)} className="h-11 px-4 rounded-lg border font-bold bg-white" style={{ borderColor: LINE }}>Done</button>
            </div>
          </section>
        )}

        <section className="bg-white rounded-2xl p-4 flex flex-col gap-2">
          <h2 className="font-extrabold text-lg">Owners</h2>
          <p className="text-[15px]">{owners.map((o) => o[0].toUpperCase() + o.slice(1)).join(", ") || "None set"}: everything. (Their passwords are in Vercel.)</p>
        </section>

        {(list ?? []).map((s) => (
          <section key={s.username} className="bg-white rounded-2xl p-4 flex flex-col gap-2" style={{ opacity: s.active ? 1 : 0.7 }}>
            <div className="flex items-center justify-between gap-2">
              <div><p className="font-extrabold text-lg">{s.display_name}</p><p className="text-sm" style={{ color: MUTED }}>Signs in as <span className="font-mono">{s.username}</span> · last in {when(s.last_login_at)}</p></div>
              {!s.active && <span className="text-xs font-bold rounded-full px-2 py-1 bg-[#eef1f6]">Off</span>}
            </div>
            <label className="flex flex-col gap-1 text-sm font-semibold">What they do
              <select value={s.role} onChange={(e) => post({ action: "update", username: s.username, role: e.target.value })} className={field} style={{ borderColor: LINE }}>
                {STAFF_ROLES.map((r) => <option key={r} value={r}>{roles[r]?.name ?? r}</option>)}
              </select>
            </label>
            <p className="text-sm" style={{ color: MUTED }}>{roles[s.role]?.blurb}</p>
            <div className="flex gap-2 flex-wrap">
              <button disabled={busy} onClick={async () => { const j = await post({ action: "update", username: s.username, reset: true }); if (j?.password) setShown({ username: s.username, password: j.password, name: s.display_name }); }}
                className="h-10 px-3 rounded-lg border font-bold text-sm" style={{ borderColor: LINE }}>New password</button>
              <button disabled={busy} onClick={() => post({ action: "update", username: s.username, active: !s.active })}
                className="h-10 px-3 rounded-lg border font-bold text-sm" style={{ borderColor: LINE }}>{s.active ? "Turn off" : "Turn back on"}</button>
            </div>
          </section>
        ))}
        {list && !list.length && ready && <p className="text-center text-sm py-2" style={{ color: MUTED }}>No staff logins yet.</p>}

        {adding ? (
          <section className="bg-white rounded-2xl p-4 flex flex-col gap-3">
            <h2 className="font-extrabold text-lg">New login</h2>
            <label className="flex flex-col gap-1 text-sm font-semibold">Their name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Teagan" className={field} style={{ borderColor: LINE }} /></label>
            <label className="flex flex-col gap-1 text-sm font-semibold">Name they sign in with <span className="font-normal" style={{ color: MUTED }}>(optional, their first name if empty)</span>
              <input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))} placeholder={name.split(/\s+/)[0]?.toLowerCase() || "teagan"} autoCapitalize="none" className={field} style={{ borderColor: LINE }} /></label>
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-semibold mb-1">What they do</legend>
              {STAFF_ROLES.map((r) => (
                <label key={r} className="rounded-xl border p-3 flex gap-3 cursor-pointer" style={{ borderColor: role === r ? NAVY : LINE, borderWidth: role === r ? 2 : 1 }}>
                  <input type="radio" name="role" checked={role === r} onChange={() => setRole(r)} className="mt-1 w-5 h-5" style={{ accentColor: NAVY }} />
                  <span><span className="font-bold">{roles[r]?.name ?? r}</span><br /><span className="text-sm" style={{ color: MUTED }}>{roles[r]?.blurb}</span></span>
                </label>
              ))}
            </fieldset>
            <label className="flex flex-col gap-1 text-sm font-semibold">Password <span className="font-normal" style={{ color: MUTED }}>(optional, we make an easy one if empty)</span>
              <input value={pw} onChange={(e) => setPw(e.target.value)} className={field} style={{ borderColor: LINE }} /></label>
            <div className="flex gap-2">
              <button onClick={add} disabled={busy || !name.trim()} className="h-12 flex-1 rounded-xl font-extrabold disabled:opacity-60" style={{ background: GOLD, color: NAVY }}>{busy ? "Saving…" : "Make the login"}</button>
              <button onClick={() => setAdding(false)} className="h-12 px-4 rounded-xl border font-bold" style={{ borderColor: LINE }}>Cancel</button>
            </div>
          </section>
        ) : (
          <button onClick={() => setAdding(true)} className="h-12 rounded-xl font-extrabold" style={{ background: GOLD, color: NAVY }}>+ New staff login</button>
        )}
      </div>
      <OwnerNav />
    </div>
  );
}
