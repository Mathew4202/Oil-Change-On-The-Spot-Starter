"use client";
// One fleet: its vehicles (unit numbers, agreed prices, when each is due), booking a yard visit, and invoices.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import OwnerNav from "../../OwnerNav";
import CarPicker from "@/components/CarPicker";
import AccountForm, { type AccountIn } from "../AccountForm";

const NAVY = "#0d1b3e", GOLD = "#f2b01e", LINE = "#c8d0e0", MUTED = "#4a5878";
const field = "h-12 rounded-xl border px-3 text-base w-full bg-white font-normal";
const lbl = "flex flex-col gap-1 text-sm font-semibold";
const money = (n: number) => `$${n.toFixed(2)}`;
const nice = (d: string) => new Date(d.length === 10 ? `${d}T12:00:00Z` : d).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: d.length === 10 ? "UTC" : "America/Halifax" });

type Due = { state: "ok" | "soon" | "due" | "booked" | "new"; date: string | null };
type V = { id: string; unit_number: string | null; year: number | null; make: string | null; model: string | null; engine: string | null; vin: string | null; plate: string | null;
  fleet_price: number | null; notes: string | null; active: boolean; lastService: string | null; lastKm: number | null; booked: string | null; due: Due };
type J = { id: string; done_at: string; km: number | null; vehicle_id: string | null; vehicle_text: string | null; subtotal: number; total: number; invoice_id: string | null };
type Inv = { id: string; invoice_no: number; token: string; period_start: string | null; period_end: string | null; issued_at: string; due_at: string | null; total: number; status: string; sent_at: string | null; paid_at: string | null; paid_method: string | null };
type Data = { account: AccountIn & { id: string; business_name: string; billing: string; service_every_months: number }; vehicles: V[]; unbilled: J[]; invoices: Inv[]; history: J[];
  normal: Record<string, { price: number; cost: number | null; oil: string | null } | null> };

function halifaxIso(date: string, hhmm: string) {
  const [y, m, d] = date.split("-").map(Number); const [h, mi] = hhmm.split(":").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, h, mi));
  const off = (at: Date) => {
    const n = new Intl.DateTimeFormat("en-US", { timeZone: "America/Halifax", timeZoneName: "longOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value || "GMT-04:00";
    const x = n.match(/GMT([+-])(\d{2}):(\d{2})/); return x ? (x[1] === "-" ? -1 : 1) * (Number(x[2]) * 60 + Number(x[3])) : -240;
  };
  return new Date(guess.getTime() - off(new Date(guess.getTime() - off(guess) * 60000)) * 60000).toISOString();
}
const todayHfx = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Halifax", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const BADGE: Record<Due["state"], { text: (d: Due, v: V) => string; bg: string; fg: string }> = {
  due: { text: (d) => `Due since ${nice(d.date!)}`, bg: "#fde2e1", fg: "#9b1c1c" },
  soon: { text: (d) => `Due ${nice(d.date!)}`, bg: "#fff6dd", fg: "#8a5a00" },
  booked: { text: (_d, v) => `Booked ${nice(v.booked!)}`, bg: "#dff3e6", fg: "#1d6b3a" },
  new: { text: () => "Not serviced by us yet", bg: "#eef1f6", fg: MUTED },
  ok: { text: (d) => (d.date ? `Next ${nice(d.date)}` : ""), bg: "#eef1f6", fg: MUTED },
};

export default function FleetAccount({ id }: { id: string }) {
  const [d, setD] = useState<Data | null>(null); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const [edit, setEdit] = useState(false);
  const [vForm, setVForm] = useState<Record<string, string> | null>(null);
  const [pick, setPick] = useState<string[]>([]);
  const [date, setDate] = useState(todayHfx()); const [time, setTime] = useState("09:00"); const [note, setNote] = useState("");
  const [billPick, setBillPick] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [portal, setPortal] = useState<string | null>(null);

  const load = () => fetch(`/api/owner/fleet?id=${id}`, { cache: "no-store" }).then((r) => r.json()).then((x) => (x.error ? setErr(x.error) : setD(x))).catch(() => setErr("Couldn't load. Check your connection."));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function post(body: object) {
    setBusy(true); setErr(""); setMsg("");
    const r = await fetch("/api/owner/fleet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId: id, ...body }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok || j.ok === false) { setErr(j.error || "Something went wrong"); return null; }
    return j;
  }

  const active = useMemo(() => (d?.vehicles ?? []).filter((v) => v.active), [d]);
  const car = (v: V) => [v.year, v.make, v.model].filter(Boolean).join(" ");
  const priceOf = (v: V) => v.fleet_price ?? d?.normal[v.id]?.price ?? null;
  const pickedTotal = pick.reduce((t, x) => { const v = active.find((y) => y.id === x); return t + (v ? priceOf(v) ?? 0 : 0); }, 0);

  async function saveVehicle() {
    const j = await post({ action: "vehicle", vehicle: vForm });
    if (j) { setVForm(null); setMsg(j.decoded ? `Saved. The VIN says ${[j.decoded.year, j.decoded.make, j.decoded.model, j.decoded.engineL ? `${j.decoded.engineL}L` : ""].filter(Boolean).join(" ")}.` : "Vehicle saved."); load(); }
  }
  async function book() {
    if (!pick.length) return setErr("Tick the vehicles to book.");
    const j = await post({ action: "book", vehicleIds: pick, start: halifaxIso(date, time), note });
    if (j) { setPick([]); setNote(""); setMsg(`Booked ${j.bookings.length} vehicle${j.bookings.length > 1 ? "s" : ""}, back to back. They're on the calendar, and each gets its own job screen.`); load(); }
  }
  async function invoice() {
    const j = await post({ action: "invoice", jobIds: billPick ?? [] });
    if (j) { setBillPick(null); setMsg(`Made ${j.invoices.length > 1 ? `${j.invoices.length} invoices` : `invoice #${j.invoices[0].invoice_no}`}. Check it, then email it.`); load(); }
  }
  async function send(inv: Inv) {
    const j = await post({ action: "send", invoiceId: inv.id });
    if (j) setMsg(j.sent ? `Invoice #${inv.invoice_no} emailed to ${j.to}.` : `Not sent: ${j.reason}. You can open it and share the link yourself.`);
    load();
  }
  async function paid(inv: Inv, method: string) { if (await post({ action: "paid", invoiceId: inv.id, method })) { setMsg(`Invoice #${inv.invoice_no} marked paid.`); load(); } }
  async function cancelInv(inv: Inv) { if (await post({ action: "void", invoiceId: inv.id })) { setMsg(`Invoice #${inv.invoice_no} cancelled. Its jobs are back in To invoice.`); load(); } }

  const chip = (on: boolean) => ({ background: on ? NAVY : "#fff", color: on ? "#fff" : NAVY, borderColor: on ? NAVY : LINE });
  const a = d?.account;
  return (
    <div className="min-h-dvh flex flex-col bg-[#eef1f6] text-[#0d1b3e] max-w-xl mx-auto">
      <header className="sticky top-0 z-10 text-white px-4 pt-[max(14px,env(safe-area-inset-top))] pb-3" style={{ background: NAVY }}>
        <Link href={"/owner/fleets" as Route} className="text-sm text-[#c9d3ea] font-semibold no-underline">‹ Fleets</Link>
        <h1 className="text-[28px] leading-none font-extrabold" style={{ fontFamily: "var(--font-condensed)" }}>{a?.business_name ?? " "}</h1>
        {a && <p className="text-sm text-[#c9d3ea] mt-1">{[a.contact_name, a.billing === "per_job" ? "invoice each job" : "monthly invoice", a.via ? `via ${a.via}` : null].filter(Boolean).join(" · ")}</p>}
      </header>

      <main className="flex-1 p-4 flex flex-col gap-4 pb-28">
        {err && <p className="text-red-700 bg-white rounded-xl p-3" role="alert">{err}</p>}
        {msg && <p className="rounded-xl p-3 font-semibold" style={{ background: "#dff3e6", color: "#1d6b3a" }} role="status">{msg}</p>}
        {!d && !err && <p className="text-center py-10" style={{ color: MUTED }}>Loading…</p>}

        {a && (edit ? <AccountForm start={a} onCancel={() => setEdit(false)} onDone={() => { setEdit(false); load(); }} /> : (
          <section className="bg-white rounded-2xl p-4 flex flex-col gap-1 text-[15px]">
            {a.phone && <p><a href={`tel:${a.phone}`} className="font-bold underline">{a.phone.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3")}</a>{a.email ? ` · ${a.email}` : ""}</p>}
            {a.address ? <p style={{ color: MUTED }}>{a.address}</p> : <p className="text-[#8a5a00] font-semibold">Add the yard address before booking.</p>}
            {a.invoice_email && <p style={{ color: MUTED }}>Invoices to {a.invoice_email}</p>}
            <p style={{ color: MUTED }}>Service every {a.service_every_months} months · pay within {a.terms_days} days</p>
            {a.notes && <p style={{ color: MUTED }}>{a.notes}</p>}
            <button onClick={() => setEdit(true)} className="self-start mt-1 text-sm font-bold underline">Edit account</button>
          </section>
        ))}

        {a && (
          <section className="bg-white rounded-2xl p-4 flex flex-col gap-2">
            <h2 className="font-extrabold text-lg">Their own page</h2>
            <p className="text-sm" style={{ color: MUTED }}>A private link for {a.contact_name || "the fleet manager"}: their vehicles, what&apos;s due, booking a yard visit, service history and invoices. No password, so only send it to them.</p>
            {portal && <p className="font-mono text-[13px] break-all select-all bg-[#f4f6fa] rounded-lg p-2">{portal}</p>}
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} onClick={async () => { const j = await post({ action: "portal", send: true }); if (j) { setPortal(j.link); setMsg(j.sms?.sent === false ? "Link made, but the text didn't go out. Copy it and send it yourself." : `Texted the link to ${a.contact_name || "them"}.`); } }}
                className="h-11 px-4 rounded-xl font-bold disabled:opacity-60" style={{ background: GOLD, color: NAVY }}>Text them the link</button>
              <button disabled={busy} onClick={async () => { const j = await post({ action: "portal" }); if (j) { setPortal(j.link); try { await navigator.clipboard.writeText(j.link); setMsg("Link copied."); } catch { /* shown above */ } } }}
                className="h-11 px-4 rounded-xl border font-bold bg-white disabled:opacity-60" style={{ borderColor: LINE }}>Copy link</button>
              <button disabled={busy} onClick={async () => { if (!confirm("Make a new link? The old one stops working.")) return; const j = await post({ action: "portal", reset: true }); if (j) { setPortal(j.link); setMsg("New link made. The old one no longer works."); } }}
                className="h-11 px-4 rounded-xl border font-bold bg-white text-sm disabled:opacity-60" style={{ borderColor: LINE }}>New link</button>
            </div>
          </section>
        )}

        {d && (
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="font-extrabold text-lg">Vehicles ({active.length})</h2>
              <div className="flex gap-2">
                {active.some((v) => v.due.state === "due" || v.due.state === "soon") && (
                  <button onClick={() => setPick(active.filter((v) => v.due.state === "due" || v.due.state === "soon").map((v) => v.id))} className="h-9 px-3 rounded-lg border font-bold text-sm bg-white" style={{ borderColor: LINE }}>Pick the due ones</button>
                )}
                <button onClick={() => setVForm({ unit_number: "", vin: "", year: "", make: "", model: "", engine: "", plate: "", fleet_price: "", notes: "" })} className="h-9 px-3 rounded-lg font-bold text-sm" style={{ background: GOLD, color: NAVY }}>+ Vehicle</button>
              </div>
            </div>

            {vForm && (
              <div className="bg-white rounded-2xl p-4 flex flex-col gap-3 border-2" style={{ borderColor: NAVY }}>
                <h3 className="font-extrabold">{vForm.id ? "Edit vehicle" : "Add a vehicle"}</h3>
                <div className="grid grid-cols-2 gap-2">
                  <label className={lbl}>Unit #<input value={vForm.unit_number} onChange={(e) => setVForm({ ...vForm, unit_number: e.target.value })} className={field} style={{ borderColor: LINE }} /></label>
                  <label className={lbl}>Plate<input value={vForm.plate} onChange={(e) => setVForm({ ...vForm, plate: e.target.value.toUpperCase() })} className={field} style={{ borderColor: LINE }} /></label>
                </div>
                <label className={lbl}>VIN <span className="font-normal" style={{ color: MUTED }}>(leave the car empty and the VIN fills it in)</span>
                  <input value={vForm.vin} onChange={(e) => setVForm({ ...vForm, vin: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17) })} className={`${field} font-mono`} style={{ borderColor: LINE }} />
                </label>
                <CarPicker year={vForm.year} make={vForm.make} model={vForm.model} onChange={(c) => setVForm({ ...vForm, ...c })} />
                <div className="grid grid-cols-2 gap-2">
                  <label className={lbl}>Engine<input value={vForm.engine} onChange={(e) => setVForm({ ...vForm, engine: e.target.value })} placeholder="e.g. 6.6L" className={field} style={{ borderColor: LINE }} /></label>
                  <label className={lbl}>Fleet price before HST<input value={vForm.fleet_price} onChange={(e) => setVForm({ ...vForm, fleet_price: e.target.value.replace(/[^\d.]/g, "") })} inputMode="decimal" placeholder="Normal price" className={field} style={{ borderColor: LINE }} /></label>
                </div>
                <label className={lbl}>Notes<input value={vForm.notes} onChange={(e) => setVForm({ ...vForm, notes: e.target.value })} className={field} style={{ borderColor: LINE }} /></label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setVForm(null)} className="h-12 rounded-xl border font-bold" style={{ borderColor: LINE }}>Cancel</button>
                  <button onClick={saveVehicle} disabled={busy} className="h-12 rounded-xl font-extrabold disabled:opacity-60" style={{ background: GOLD, color: NAVY }}>{busy ? "Saving…" : "Save"}</button>
                </div>
              </div>
            )}

            {active.length === 0 && !vForm && <p className="bg-white rounded-2xl p-4" style={{ color: MUTED }}>No vehicles yet. Add each one with its unit number, or just the VIN.</p>}
            {active.map((v) => {
              const n = d.normal[v.id]; const on = pick.includes(v.id); const b = BADGE[v.due.state];
              const price = priceOf(v); const profit = price != null && n?.cost != null ? price - n.cost : null;
              return (
                <div key={v.id} className="bg-white rounded-2xl p-3 flex gap-3 border-2" style={{ borderColor: on ? NAVY : "transparent" }}>
                  <input type="checkbox" checked={on} onChange={() => setPick((p) => on ? p.filter((x) => x !== v.id) : [...p, v.id])} aria-label={`Pick ${car(v)}`} className="mt-1 w-6 h-6 shrink-0" style={{ accentColor: NAVY }} />
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <p className="font-bold text-[16px]">{v.unit_number ? `Unit ${v.unit_number} · ` : ""}{car(v)}{v.engine ? ` ${v.engine}` : ""}</p>
                    <p className="text-sm" style={{ color: MUTED }}>{[v.plate, n?.oil, v.lastKm ? `${v.lastKm.toLocaleString()} km` : null].filter(Boolean).join(" · ")}</p>
                    <p className="text-sm">{price != null ? <><strong>{money(price)}</strong>{v.fleet_price != null ? " fleet price" : " (normal price)"}</> : "Price on booking"}{profit != null && <span style={{ color: profit < 45 ? "#9b1c1c" : MUTED }}> · about {money(profit)} profit</span>}</p>
                    {b.text(v.due, v) && <span className="self-start text-xs font-bold rounded-full px-2 py-1 mt-1" style={{ background: b.bg, color: b.fg }}>{b.text(v.due, v)}</span>}
                  </div>
                  <button onClick={() => setVForm({ id: v.id, unit_number: v.unit_number ?? "", vin: v.vin ?? "", year: String(v.year ?? ""), make: v.make ?? "", model: v.model ?? "", engine: v.engine ?? "", plate: v.plate ?? "", fleet_price: v.fleet_price != null ? String(v.fleet_price) : "", notes: v.notes ?? "" })}
                    className="self-start text-sm font-bold underline">Edit</button>
                </div>
              );
            })}
          </section>
        )}

        {d && pick.length > 0 && (
          <section className="bg-white rounded-2xl p-4 flex flex-col gap-3 border-2" style={{ borderColor: GOLD }}>
            <h2 className="font-extrabold text-lg">Book {pick.length} vehicle{pick.length > 1 ? "s" : ""} at the yard</h2>
            <div className="grid grid-cols-2 gap-2">
              <label className={lbl}>Day<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} style={{ borderColor: LINE }} /></label>
              <label className={lbl}>Start<input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} style={{ borderColor: LINE }} /></label>
            </div>
            <label className={lbl}>Note for the visit<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Keys at the front desk, PO 4471" className={field} style={{ borderColor: LINE }} /></label>
            <p className="text-sm" style={{ color: MUTED }}>Done one after another, about {Math.round(pick.length * 75 / 60 * 10) / 10} hours. {money(pickedTotal)} + HST, billed on the fleet&apos;s invoice.</p>
            <button onClick={book} disabled={busy} className="h-12 rounded-xl font-extrabold disabled:opacity-60" style={{ background: GOLD, color: NAVY }}>{busy ? "Booking…" : "Book the visit"}</button>
          </section>
        )}

        {d && (
          <section className="flex flex-col gap-2">
            <h2 className="font-extrabold text-lg">To invoice</h2>
            {d.unbilled.length === 0 ? <p className="bg-white rounded-2xl p-4" style={{ color: MUTED }}>Nothing waiting. Finished fleet jobs show up here.</p> : (
              <div className="bg-white rounded-2xl p-4 flex flex-col gap-2">
                {d.unbilled.map((j) => {
                  const on = billPick ? billPick.includes(j.id) : true;
                  return (
                    <label key={j.id} className="flex items-center gap-3 text-[15px]">
                      <input type="checkbox" checked={on} onChange={() => setBillPick((p) => { const cur = p ?? d.unbilled.map((x) => x.id); return on ? cur.filter((x) => x !== j.id) : [...cur, j.id]; })} className="w-5 h-5" style={{ accentColor: NAVY }} />
                      <span className="flex-1">{nice(j.done_at)} · {(j.vehicle_id && active.find((v) => v.id === j.vehicle_id)?.unit_number) ? `Unit ${active.find((v) => v.id === j.vehicle_id)!.unit_number} · ` : ""}{j.vehicle_text}</span>
                      <span className="font-bold">{money(j.subtotal)}</span>
                    </label>
                  );
                })}
                <button onClick={invoice} disabled={busy || (billPick !== null && billPick.length === 0)} className="h-12 rounded-xl font-extrabold mt-1 disabled:opacity-60" style={{ background: GOLD, color: NAVY }}>
                  {busy ? "Making…" : d.account.billing === "per_job" ? "Make an invoice for each job" : "Make the invoice"}
                </button>
              </div>
            )}
          </section>
        )}

        {d && d.invoices.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="font-extrabold text-lg">Invoices</h2>
            {d.invoices.filter((i) => i.status !== "void").map((i) => (
              <div key={i.id} className="bg-white rounded-2xl p-4 flex flex-col gap-2">
                <div className="flex justify-between gap-2">
                  <p className="font-bold">#{i.invoice_no} · {money(Number(i.total))}</p>
                  <span className="text-xs font-bold rounded-full px-2 py-1" style={i.status === "paid" ? { background: "#dff3e6", color: "#1d6b3a" } : i.due_at && i.due_at < todayHfx() ? { background: "#fde2e1", color: "#9b1c1c" } : { background: "#fff6dd", color: "#8a5a00" }}>
                    {i.status === "paid" ? `Paid${i.paid_method ? ` (${i.paid_method === "etransfer" ? "e-transfer" : i.paid_method.replace("_terminal", "")})` : ""}` : i.due_at && i.due_at < todayHfx() ? "Overdue" : `Due ${i.due_at ? nice(i.due_at) : ""}`}
                  </span>
                </div>
                <p className="text-sm" style={{ color: MUTED }}>{i.period_start && i.period_end ? (i.period_start === i.period_end ? nice(i.period_start) : `${nice(i.period_start)} to ${nice(i.period_end)}`) : ""}{i.sent_at ? ` · emailed ${nice(i.sent_at)}` : " · not emailed yet"}</p>
                <div className="flex flex-wrap gap-2">
                  <a href={`/invoice/${i.token}`} target="_blank" rel="noreferrer" className="h-10 px-3 rounded-lg border font-bold text-sm flex items-center no-underline text-[#0d1b3e]" style={{ borderColor: LINE }}>Open</a>
                  {i.status === "open" && <button onClick={() => send(i)} disabled={busy} className="h-10 px-3 rounded-lg font-bold text-sm text-white" style={{ background: NAVY }}>{i.sent_at ? "Email again" : "Email it"}</button>}
                </div>
                {i.status === "open" && (
                  <div className="flex flex-wrap gap-2 items-center text-sm">
                    <span className="font-semibold">Paid by:</span>
                    {[["etransfer", "E-transfer"], ["cheque", "Cheque"], ["card_terminal", "Card"]].map(([k, n]) => <button key={k} onClick={() => paid(i, k)} disabled={busy} className="h-9 px-3 rounded-lg border font-bold" style={chip(false)}>{n}</button>)}
                    <button onClick={() => cancelInv(i)} disabled={busy} className="ml-auto underline font-semibold" style={{ color: MUTED }}>Cancel invoice</button>
                  </div>
                )}
              </div>
            ))}
          </section>
        )}
      </main>
      <OwnerNav />
    </div>
  );
}
