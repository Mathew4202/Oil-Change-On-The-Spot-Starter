"use client";
// Finish a job: odometer, quick check, what was used, extras, who did it, payment, receipt.
import { useEffect, useMemo, useState } from "react";

const NAVY = "#0d1b3e", GOLD = "#f2b01e", LINE = "#c8d0e0";
type Line = { label: string; amount: number };
type Ctx = {
  booking: { id: string; status: string; starts_at: string; address: string | null; pay_mode: string; quote_breakdown: { lines?: Line[] } | null;
    services: { job?: string; own?: string | null } | null; cars: number; paid_at: string | null };
  customer: { first_name: string | null; last_name: string | null; phone: string | null; email: string | null } | null;
  vehicle: { year: number | null; make: string | null; model: string | null; last_km: number | null; vin: string | null;
    vehicle_specs: { oil_grade: string; capacity_l: number; oil_filter_part: string | null } | null } | null;
  job: { receipt_no: number; total: number; payment_method: string | null; receipt_sent_at: string | null } | null;
};
const CHECKS: [string, string][] = [
  ["coolant", "Coolant"], ["brake_fluid", "Brake fluid"], ["washer_fluid", "Washer fluid"], ["engine_filter", "Engine air filter"],
  ["cabin_filter", "Cabin air filter"], ["wipers", "Wipers"], ["tires", "Tires"], ["lights", "Lights"],
];
const PAY: [string, string][] = [["card_terminal", "Card"], ["cash", "Cash"], ["etransfer", "E-transfer"], ["card_online", "Paid online"]];
const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`;
const field = "h-12 rounded-xl border px-3 text-base w-full bg-white";

export default function JobSheet({ bookingId, owner, onClose }: { bookingId: string; owner: string; onClose: (changed: boolean) => void }) {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>("");
  // form
  const [km, setKm] = useState("");
  const [vin, setVin] = useState("");
  const [grade, setGrade] = useState(""); const [litres, setLitres] = useState(""); const [filter, setFilter] = useState("");
  const [checks, setChecks] = useState<Record<string, "ok" | "soon" | "now">>(Object.fromEntries(CHECKS.map(([k]) => [k, "ok"])));
  const [extras, setExtras] = useState<{ label: string; amount: string }[]>([]);
  const [doneBy, setDoneBy] = useState<"both" | "mathew" | "harsh">("both");
  const [notes, setNotes] = useState("");
  const [pay, setPay] = useState<string>("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    fetch(`/api/owner/job?booking=${bookingId}`).then((r) => r.json()).then((c: Ctx) => {
      setCtx(c);
      const s = c.vehicle?.vehicle_specs;
      if (s) { setGrade(s.oil_grade); setLitres(String(Number(s.capacity_l) * (c.booking.cars || 1))); setFilter(s.oil_filter_part || ""); }
      setEmail(c.customer?.email || ""); setVin(c.vehicle?.vin || "");
      if (c.booking.pay_mode === "online") setPay("card_online");
    }).catch(() => setErr("Couldn't load this job"));
  }, [bookingId]);

  const withOil = !ctx?.booking.services?.job || ["oil_change", "seasonal"].includes(ctx.booking.services.job || "");
  const lines: Line[] = useMemo(() => [
    ...(ctx?.booking.quote_breakdown?.lines ?? []),
    ...extras.filter((e) => e.label.trim() && e.amount.trim() && !isNaN(Number(e.amount))).map((e) => ({ label: e.label.trim(), amount: Number(e.amount) })),
  ], [ctx, extras]);
  const subtotal = Math.round(lines.reduce((t, l) => t + l.amount, 0) * 100) / 100;
  const hst = Math.round(subtotal * 14) / 100;
  const total = Math.round((subtotal + hst) * 100) / 100;

  async function post(body: object) {
    setBusy(true); setErr("");
    const r = await fetch("/api/owner/job", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookingId, ...body }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok || j.ok === false) { setErr(j.error || "Something went wrong"); return null; }
    return j;
  }

  const receiptMsg = (rc?: { sent: boolean; reason?: string } | null) =>
    !rc ? "" : rc.sent ? ` Receipt emailed${email ? ` to ${email}` : ""}.` : rc.reason === "no email on file" ? " No email on file, so no receipt was sent."
      : rc.reason === "waiting for payment" ? " The receipt goes out when you mark it paid." : ` Receipt not sent (${rc.reason}).`;

  async function finish() {
    const v = vin.trim().toUpperCase().replace(/\s/g, "");
    if (v && !/^[A-HJ-NPR-Z0-9]{17}$/.test(v)) return setErr("A VIN is 17 letters and numbers (no I, O or Q). Check it, or leave it empty.");
    if (withOil && km && Number(km) < (ctx?.vehicle?.last_km ?? 0)) return setErr(`That's less than last time (${ctx?.vehicle?.last_km?.toLocaleString()} km). Check the odometer.`);
    const j = await post({
      action: "finish", km: km ? Number(km.replace(/\D/g, "")) : null, vin: vin.trim() || null,
      oilGrade: withOil ? grade || null : null, oilLitres: withOil && litres ? Number(litres) : null, filterPart: withOil ? filter || null : null,
      inspection: Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, { status: v }])),
      extraLines: lines.slice((ctx?.booking.quote_breakdown?.lines ?? []).length), doneBy, notes: notes || undefined,
      payMethod: pay || null, email: email.trim() || null, sendReceipt: true,
    });
    if (j) setResult(`Job done. Receipt #${j.receiptNo}, ${money(j.total)}${pay ? ", paid" : ", not paid yet"}.${receiptMsg(j.receipt)}`);
  }
  async function markPaid() {
    if (!pay) return setErr("Pick how they paid");
    const j = await post({ action: "pay", method: pay, email: email.trim() || null });
    if (j) setResult(`Marked paid.${receiptMsg(j.receipt)}`);
  }
  async function resend() {
    const j = await post({ action: "resend", email: email.trim() || null });
    if (j) setResult(receiptMsg(j.receipt).trim() || "Done.");
  }

  const chip = (on: boolean) => ({ background: on ? NAVY : "#fff", color: on ? "#fff" : NAVY, borderColor: on ? NAVY : LINE });
  const checkColor = { ok: "#dff3e6", soon: "#fff6dd", now: "#fde2e1" } as const;
  const name = [ctx?.customer?.first_name, ctx?.customer?.last_name].filter(Boolean).join(" ");
  const car = [ctx?.vehicle?.year, ctx?.vehicle?.make, ctx?.vehicle?.model].filter(Boolean).join(" ");
  const finished = !!ctx?.job;

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex justify-center" onClick={() => onClose(!!result)}>
      <div className="w-full max-w-xl h-full bg-[#eef1f6] flex flex-col" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Job">
        <div className="flex items-center justify-between gap-3 p-4 text-white pt-[max(16px,env(safe-area-inset-top))]" style={{ background: NAVY }}>
          <div className="min-w-0">
            <h2 className="text-2xl font-extrabold truncate" style={{ fontFamily: "var(--font-condensed)" }}>{name || "Job"}</h2>
            <p className="text-sm text-[#c9d3ea] truncate">{car}{ctx?.booking.address ? ` · ${ctx.booking.address}` : ""}</p>
          </div>
          <button onClick={() => onClose(!!result)} className="h-10 px-3 rounded-lg border border-[#3b4d7a] font-bold text-sm shrink-0">Close</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 pb-36">
          {!ctx && !err && <p className="text-center text-[#4a5878] py-10">Loading…</p>}

          {result && (
            <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: "#dff3e6", border: "1px solid #9fd3b2" }} role="status">
              <p className="font-bold text-[17px] text-[#1d6b3a]">{result}</p>
              <button onClick={() => onClose(true)} className="h-11 rounded-lg font-extrabold" style={{ background: NAVY, color: "#fff" }}>Back to calendar</button>
            </div>
          )}

          {ctx && finished && !result && (
            <section className="bg-white rounded-2xl p-4 flex flex-col gap-3">
              <h3 className="font-extrabold text-lg">Receipt #{ctx.job!.receipt_no} · {money(Number(ctx.job!.total))}</h3>
              {ctx.booking.paid_at ? <p className="font-semibold text-[#1d6b3a]">Paid{ctx.job!.payment_method ? ` (${PAY.find(([k]) => k === ctx.job!.payment_method)?.[1] ?? ctx.job!.payment_method})` : ""}</p> : (
                <>
                  <p className="font-semibold text-[#8a5a00]">Not paid yet. How did they pay?</p>
                  <div className="grid grid-cols-2 gap-2">{PAY.map(([k, n]) => <button key={k} onClick={() => setPay(k)} className="h-11 rounded-lg border font-bold text-sm" style={chip(pay === k)}>{n}</button>)}</div>
                </>
              )}
              <label className="flex flex-col gap-1 text-sm font-semibold">Customer email<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="For the receipt" className={field} style={{ borderColor: LINE }} /></label>
              {!ctx.booking.paid_at
                ? <button onClick={markPaid} disabled={busy} className="h-12 rounded-xl font-extrabold disabled:opacity-60" style={{ background: GOLD, color: NAVY }}>{busy ? "Saving…" : "Mark paid and send receipt"}</button>
                : <button onClick={resend} disabled={busy} className="h-12 rounded-xl border font-bold disabled:opacity-60" style={{ borderColor: LINE }}>{busy ? "Sending…" : ctx.job!.receipt_sent_at ? "Send receipt again" : "Send receipt"}</button>}
            </section>
          )}

          {ctx && !finished && !result && (
            <>
              <section className="bg-white rounded-2xl p-4 flex flex-col gap-3">
                <h3 className="font-extrabold text-lg">The car</h3>
                <label className="flex flex-col gap-1 text-sm font-semibold">Odometer (km)
                  <input value={km} onChange={(e) => setKm(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder={ctx.vehicle?.last_km ? `Last time: ${ctx.vehicle.last_km.toLocaleString()} km` : "e.g. 84210"} className={field} style={{ borderColor: LINE }} />
                </label>
                <label className="flex flex-col gap-1 text-sm font-semibold">VIN (optional, prints on the receipt for warranty)
                  <input value={vin} onChange={(e) => setVin(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17))} autoCapitalize="characters"
                    placeholder="17 characters, bottom of windshield" className={`${field} font-mono tracking-wide`} style={{ borderColor: LINE }} />
                </label>
                {withOil && ctx.booking.services?.own !== "both" && (
                  <div className="grid grid-cols-3 gap-2">
                    <label className="flex flex-col gap-1 text-sm font-semibold">Oil<input value={grade} onChange={(e) => setGrade(e.target.value)} className={field} style={{ borderColor: LINE }} /></label>
                    <label className="flex flex-col gap-1 text-sm font-semibold">Litres<input value={litres} onChange={(e) => setLitres(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" className={field} style={{ borderColor: LINE }} /></label>
                    <label className="flex flex-col gap-1 text-sm font-semibold">Filter<input value={filter} onChange={(e) => setFilter(e.target.value)} className={field} style={{ borderColor: LINE }} /></label>
                  </div>
                )}
              </section>

              <section className="bg-white rounded-2xl p-4 flex flex-col gap-2">
                <h3 className="font-extrabold text-lg">Quick check</h3>
                <p className="text-sm text-[#4a5878]">Tap to change: OK → Soon → Needs it now.</p>
                <div className="grid grid-cols-2 gap-2">
                  {CHECKS.map(([k, n]) => (
                    <button key={k} onClick={() => setChecks((c) => ({ ...c, [k]: c[k] === "ok" ? "soon" : c[k] === "soon" ? "now" : "ok" }))}
                      className="h-12 rounded-lg px-3 flex items-center justify-between text-sm font-bold border" style={{ background: checkColor[checks[k]], borderColor: LINE }}>
                      <span>{n}</span><span>{checks[k] === "ok" ? "OK" : checks[k] === "soon" ? "Soon" : "Now"}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="bg-white rounded-2xl p-4 flex flex-col gap-2">
                <h3 className="font-extrabold text-lg">Charges</h3>
                {lines.map((l, i) => <div key={i} className="flex justify-between gap-3 text-[15px]"><span className="text-[#4a5878]">{l.label}</span><span>{money(l.amount)}</span></div>)}
                {extras.map((e, i) => (
                  <div key={i} className="grid grid-cols-[1fr_96px_40px] gap-2">
                    <input value={e.label} onChange={(ev) => setExtras((x) => x.map((y, j) => j === i ? { ...y, label: ev.target.value } : y))} placeholder="What (e.g. cabin filter)" className={field} style={{ borderColor: LINE }} />
                    <input value={e.amount} onChange={(ev) => setExtras((x) => x.map((y, j) => j === i ? { ...y, amount: ev.target.value.replace(/[^\d.-]/g, "") } : y))} inputMode="decimal" placeholder="$" className={field} style={{ borderColor: LINE }} />
                    <button onClick={() => setExtras((x) => x.filter((_, j) => j !== i))} aria-label="Remove" className="h-12 rounded-xl border font-bold" style={{ borderColor: LINE }}>×</button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <button onClick={() => setExtras((x) => [...x, { label: "", amount: "" }])} className="h-10 px-3 rounded-lg border font-bold text-sm" style={{ borderColor: LINE }}>+ Add item</button>
                  <button onClick={() => setExtras((x) => [...x, { label: "Discount", amount: "-" }])} className="h-10 px-3 rounded-lg border font-bold text-sm" style={{ borderColor: LINE }}>+ Discount</button>
                </div>
                <div className="border-t border-[#eef1f6] pt-2 flex flex-col gap-1 text-[15px]">
                  <div className="flex justify-between text-[#4a5878]"><span>HST 14%</span><span>{money(hst)}</span></div>
                  <div className="flex justify-between font-extrabold text-lg"><span>Total</span><span>{money(total)}</span></div>
                </div>
              </section>

              <section className="bg-white rounded-2xl p-4 flex flex-col gap-3">
                <h3 className="font-extrabold text-lg">Who did it</h3>
                <div className="grid grid-cols-3 gap-2">{([["both", "Both"], ["mathew", "Mathew"], ["harsh", "Harsh"]] as const).map(([k, n]) => <button key={k} onClick={() => setDoneBy(k)} className="h-11 rounded-lg border font-bold text-sm" style={chip(doneBy === k)}>{n}</button>)}</div>
                <h3 className="font-extrabold text-lg mt-1">How did they pay?</h3>
                <div className="grid grid-cols-2 gap-2">{PAY.map(([k, n]) => <button key={k} onClick={() => setPay(pay === k ? "" : k)} className="h-11 rounded-lg border font-bold text-sm" style={chip(pay === k)}>{n}</button>)}</div>
                {!pay && <p className="text-sm text-[#8a5a00]">Not paid yet? Leave this empty and mark it paid later.</p>}
                <label className="flex flex-col gap-1 text-sm font-semibold">Customer email (for the receipt)<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Optional" className={field} style={{ borderColor: LINE }} /></label>
                <label className="flex flex-col gap-1 text-sm font-semibold">Notes (optional)<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Anything for next time" className="rounded-xl border p-3 text-base" style={{ borderColor: LINE }} /></label>
              </section>
            </>
          )}
        </div>

        {ctx && !finished && !result && (
          <div className="fixed bottom-0 inset-x-0 z-50 bg-white border-t border-[#dde3ee] p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
            <div className="max-w-xl mx-auto flex flex-col gap-2">
              {err && <p className="text-sm text-red-700" role="alert">{err}</p>}
              <button onClick={finish} disabled={busy} className="py-3.5 rounded-xl font-extrabold text-base disabled:opacity-60" style={{ background: GOLD, color: NAVY }}>
                {busy ? "Saving…" : pay ? `Finish job · ${money(total)} paid` : `Finish job · ${money(total)}`}
              </button>
              <p className="text-xs text-center text-[#4a5878]">Signed in as {owner}</p>
            </div>
          </div>
        )}
        {err && (finished || result) && <p className="p-3 text-sm text-red-700" role="alert">{err}</p>}
      </div>
    </div>
  );
}
