"use client";

import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";

const CA_POSTAL_RE =
  /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d$/i;

const HRM_FSAS = [
  "B2T","B2V","B2W","B2X","B2Y","B2Z",
  "B3A","B3E","B3G","B3H","B3J","B3K","B3L","B3M","B3N","B3P","B3R","B3S","B3T","B3V","B3W","B3X","B3Y","B3Z",
  "B4A","B4B","B4C","B4E",
];

type FormState = {
  companyName: string;

  fleetCount: number | "";
  vehicleTypes: string;
  serviceFrequency: string;

  interestOil: boolean;
  interestInspections: boolean;
  interestTirePressure: boolean;
  interestBattery: boolean;
  interestFluids: boolean;
  interestTracking: boolean;
  interestLogs: boolean;
  interestPriority: boolean;
  interestAfterHours: boolean;

  startDate: string;

  postal: string;
  outOfArea: boolean;
};

export default function FleetRequestClient() {
  const topRef = useRef<HTMLDivElement>(null);

  const [f, setF] = useState<FormState>({
    companyName: "",

    fleetCount: "",
    vehicleTypes: "",
    serviceFrequency: "",

    interestOil: true,
    interestInspections: true,
    interestTirePressure: true,
    interestBattery: false,
    interestFluids: true,
    interestTracking: true,
    interestLogs: true,
    interestPriority: false,
    interestAfterHours: false,

    startDate: "",

    postal: "",
    outOfArea: false,
  });

  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [ts, setTs] = useState("");
  useEffect(() => setTs(String(Date.now())), []);

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  const onPostalChange = (v: string) => {
    const cleaned = v.toUpperCase().replace(/\s+/g, "");
    let out = false;

    if (CA_POSTAL_RE.test(cleaned)) {
      const fsa = cleaned.slice(0, 3);
      out = !HRM_FSAS.includes(fsa);
    }

    setF((p) => ({ ...p, postal: v, outOfArea: out }));
  };

  function interestList() {
    const list: string[] = [];
    if (f.interestOil) list.push("Oil changes");
    if (f.interestInspections) list.push("Inspections");
    if (f.interestTirePressure) list.push("Tire pressure checks");
    if (f.interestBattery) list.push("Battery testing");
    if (f.interestFluids) list.push("Fluid top ups");
    if (f.interestTracking) list.push("Maintenance tracking");
    if (f.interestLogs) list.push("Service logs");
    if (f.interestPriority) list.push("Priority scheduling");
    if (f.interestAfterHours) list.push("After-hours servicing");
    return list;
  }

  async function submitFleet(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const qty = Number(f.fleetCount);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Enter number of vehicles.");
      topRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    if (!f.vehicleTypes.trim()) {
      setError("Enter vehicle types.");
      topRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    if (!f.serviceFrequency.trim()) {
      setError("Enter service frequency needed.");
      topRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    const interests = interestList();
    if (interests.length === 0) {
      setError("Select at least one service you are interested in.");
      topRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    if (!f.startDate) {
      setError("Pick a preferred start date.");
      topRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    const form = e.currentTarget;
    const fd = new FormData(form);

    fd.set("postal", f.postal);
    fd.set("outOfArea", f.outOfArea ? "true" : "false");
    fd.set("company_name", f.companyName);

    fd.set("preferred_date", f.startDate);
    fd.set("preferred_time", "");

    fd.set("fleet_request", "true");
    fd.set("fleet_count", String(Math.floor(qty)));
    fd.set("fleet_vehicle_types", f.vehicleTypes);
    fd.set("fleet_service_frequency", f.serviceFrequency);
    fd.set("fleet_services_interested", interests.join(", "));

    fd.set("fleet_plan_id", "fleet_custom");
    fd.set("fleet_plan_label", "Fleet maintenance program request");

    fd.set("service", "fleet_request");
    fd.set("addons", "None selected");
    fd.set("price_base", "0");
    fd.set("price_addons", "0");
    fd.set("discount", "0");
    fd.set("price_subtotal", "0");
    fd.set("price_tax", "0");
    fd.set("price_total", "0");

    fd.set("ts", ts);

    try {
      const r = await fetch("/api/quote-email", { method: "POST", body: fd });
      const isJson = r.headers.get("content-type")?.includes("application/json");
      const j = isJson ? await r.json() : { error: await r.text() };
      if (!r.ok || j?.error) throw new Error(j?.error || "Could not send request");

      setDone(true);
      try {
        track("fleet_request_submitted", {
          fleetCount: Math.floor(qty),
          outOfArea: f.outOfArea,
        });
      } catch {}
      form.reset();
      setTs(String(Date.now()));
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      topRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }

  if (done) {
    return (
      <div className="container py-16 text-center">
        <h1 className="text-3xl font-bold">Request Sent</h1>
        <p className="mt-3 text-slate-600">
          Thanks. We received your fleet request. We will review it and get back to you soon.
        </p>
        <a
          href="/"
          className="inline-flex mt-6 px-5 py-2.5 rounded-lg bg-brand text-white font-semibold hover:bg-brand-light"
        >
          Back to Home
        </a>
      </div>
    );
  }

  return (
    <div className="container py-10 space-y-10">
      <div ref={topRef} className="space-y-2">
        <h1 className="text-3xl font-bold">Fleet Request</h1>
        <p className="text-slate-600">
          We help businesses reduce downtime by servicing vehicles on-site. Submit your details and we will follow up with a custom maintenance proposal.
        </p>
      </div>

      <section className="rounded-2xl border bg-white p-7 shadow-sm space-y-2">
        <h2 className="text-2xl font-bold">Tell Us About Your Fleet</h2>
        <p className="text-slate-700">
          Every fleet has different service needs. We build programs based on your vehicles, scheduling requirements, and service frequency.
        </p>
      </section>

      <section className="rounded-2xl border bg-white p-7 shadow-sm">
        {error ? <p className="text-red-600 mb-4">{error}</p> : null}

        <form onSubmit={submitFleet} encType="multipart/form-data" className="space-y-6 max-w-3xl">
          <input type="hidden" name="ts" value={ts} />

          <div className="hidden" aria-hidden="true">
            <label>Company</label>
            <input type="text" name="company" autoComplete="off" />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium">Company name (optional)</label>
              <input
                value={f.companyName}
                onChange={(e) => update("companyName", e.target.value)}
                className="w-full border rounded px-3 py-2"
                placeholder="Example: ABC Delivery"
              />
            </div>

            <div>
              <label className="block text-sm font-medium">Preferred start date</label>
              <input
                type="date"
                value={f.startDate}
                onChange={(e) => update("startDate", e.target.value)}
                className="w-full border rounded px-3 py-2"
                required
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium">Number of vehicles</label>
              <input
                type="number"
                min={1}
                max={999}
                value={f.fleetCount}
                onChange={(e) => update("fleetCount", e.target.value ? Number(e.target.value) : "")}
                className="w-full border rounded px-3 py-2"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium">Vehicle types</label>
              <input
                value={f.vehicleTypes}
                onChange={(e) => update("vehicleTypes", e.target.value)}
                className="w-full border rounded px-3 py-2"
                placeholder="Example: 6 sedans, 2 SUVs, 2 vans"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium">Service frequency needed</label>
            <input
              value={f.serviceFrequency}
              onChange={(e) => update("serviceFrequency", e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="Example: every 6 weeks"
              required
            />
          </div>

          <div className="rounded-xl border bg-slate-50 p-5">
            <div className="text-lg font-semibold text-slate-900">Services you are interested in</div>
            <div className="mt-3 grid sm:grid-cols-2 gap-2 text-slate-700">
              {[
                ["interestOil", "Oil changes"],
                ["interestInspections", "Inspections"],
                ["interestTirePressure", "Tire pressure checks"],
                ["interestBattery", "Battery testing"],
                ["interestFluids", "Fluid top ups"],
                ["interestTracking", "Maintenance tracking"],
                ["interestLogs", "Service logs"],
                ["interestPriority", "Priority scheduling"],
                ["interestAfterHours", "After-hours servicing"],
              ].map(([k, label]) => (
                <label key={k} className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={(f as any)[k]}
                    onChange={(e) => update(k as any, e.target.checked as any)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium">Full name</label>
              <input name="name" required className="w-full border rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium">Email</label>
              <input type="email" name="email" required className="w-full border rounded px-3 py-2" />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium">Phone</label>
              <input name="phone" required className="w-full border rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium">Service address</label>
              <input name="address" required className="w-full border rounded px-3 py-2" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium">Postal code</label>
            <input
              name="postal"
              value={f.postal}
              onChange={(e) => onPostalChange(e.target.value)}
              placeholder="e.g., B3K 1A1"
              className="w-full border rounded px-3 py-2"
              required
            />
            {f.postal && CA_POSTAL_RE.test(f.postal) && f.outOfArea ? (
              <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
                Outside of service area. We will review it and follow up.
              </div>
            ) : null}
          </div>

          <div>
            <label className="block text-sm font-medium">Notes (optional)</label>
            <textarea name="notes" rows={4} className="w-full border rounded px-3 py-2" />
          </div>

          <button className="w-full px-6 py-3 rounded-lg bg-brand text-white font-semibold hover:bg-brand-light">
            Request Fleet Quote
          </button>
        </form>
      </section>
    </div>
  );
}