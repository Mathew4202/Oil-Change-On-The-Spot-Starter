"use client";

import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";

export default function CustomPlanRequestClient() {
  const topRef = useRef<HTMLDivElement>(null);

  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [ts, setTs] = useState("");

  const [oilChanges, setOilChanges] = useState<string>("");
  const [inspections, setInspections] = useState<string>("");
  const [vehicleCount, setVehicleCount] = useState<string>("1");

  const [svcTire, setSvcTire] = useState(false);
  const [svcBattery, setSvcBattery] = useState(false);
  const [svcFluids, setSvcFluids] = useState(false);
  const [svcWipers, setSvcWipers] = useState(false);
  const [svcLogs, setSvcLogs] = useState(false);
  const [svcPriority, setSvcPriority] = useState(false);
  const [svcAfterHours, setSvcAfterHours] = useState(false);

  const [inlineErr, setInlineErr] = useState<Record<string, string>>({});

  useEffect(() => setTs(String(Date.now())), []);

  function selectedServicesCount() {
    return [
      svcTire,
      svcBattery,
      svcFluids,
      svcWipers,
      svcLogs,
      svcPriority,
      svcAfterHours,
    ].filter(Boolean).length;
  }

  function validate(fd: FormData) {
    const errors: Record<string, string> = {};

    const name = String(fd.get("name") || "").trim();
    const phone = String(fd.get("phone") || "").trim();
    const email = String(fd.get("email") || "").trim();
    const address = String(fd.get("address") || "").trim();
    const postal = String(fd.get("postal") || "").trim();
    const preferredDate = String(fd.get("preferred_date") || "").trim();
    const serviceIssue = String(fd.get("service_issue") || "").trim();

    if (!name) errors.name = "Full name is required.";
    if (!phone) errors.phone = "Phone is required.";
    if (!email) errors.email = "Email is required.";
    if (!address) errors.address = "Service address is required.";
    if (!postal) errors.postal = "Postal code is required.";
    if (!preferredDate) errors.preferred_date = "Preferred start date is required.";
    if (!serviceIssue) errors.service_issue = "Tell us what you want included.";

    const oil = oilChanges.trim() ? Number(oilChanges) : 0;
    const insp = inspections.trim() ? Number(inspections) : 0;
    const svcCount = selectedServicesCount();

    const atLeastOneRequested = (Number.isFinite(oil) && oil > 0) || (Number.isFinite(insp) && insp > 0) || svcCount > 0;
    if (!atLeastOneRequested) {
      errors.request = "Select at least one requested service, or enter oil changes or inspections per year.";
    }

    const vc = Number(vehicleCount);
    if (!Number.isFinite(vc) || vc <= 0) {
      errors.custom_vehicle_count = "Vehicle count must be at least 1.";
    }

    return errors;
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError(null);

    const form = e.currentTarget;
    const fd = new FormData(form);

    const errors = validate(fd);
    setInlineErr(errors);
    if (Object.keys(errors).length > 0) {
      topRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    fd.set("custom_oil_changes", oilChanges.trim());
    fd.set("custom_inspections", inspections.trim());
    fd.set("custom_vehicle_count", vehicleCount.trim());

    fd.set("custom_tire_services", svcTire ? "on" : "");
    fd.set("custom_battery_testing", svcBattery ? "on" : "");
    fd.set("custom_fluid_services", svcFluids ? "on" : "");
    fd.set("custom_wiper_replacements", svcWipers ? "on" : "");
    fd.set("custom_maintenance_logs", svcLogs ? "on" : "");
    fd.set("custom_priority_scheduling", svcPriority ? "on" : "");
    fd.set("custom_after_hours", svcAfterHours ? "on" : "");

    fd.set("custom_plan_request", "true");
    fd.set("service", "custom_plan");

    fd.set("addons", "None selected");
    fd.set("price_base", "0");
    fd.set("price_addons", "0");
    fd.set("discount", "0");
    fd.set("price_subtotal", "0");
    fd.set("price_tax", "0");
    fd.set("price_total", "0");

    fd.set("preferred_date", String(fd.get("preferred_date") || ""));
    fd.set("preferred_time", "");
    fd.set("ts", ts);

    try {
      const r = await fetch("/api/quote-email", { method: "POST", body: fd });
      const isJson = r.headers.get("content-type")?.includes("application/json");
      const j = isJson ? await r.json() : { error: await r.text() };
      if (!r.ok || j?.error) throw new Error(j?.error || "Could not send request");

      setDone(true);
      try {
        track("custom_plan_request_submitted", {});
      } catch {}
      form.reset();
      setTs(String(Date.now()));
    } catch (err: any) {
      setSubmitError(err.message || "Something went wrong");
      topRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }

  if (done) {
    return (
      <div className="container py-16 text-center">
        <h1 className="text-3xl font-bold">Request Sent</h1>
        <p className="mt-3 text-slate-600">
          Thanks. We received your request. We will get back to you soon.
        </p>
        <a
          href="/memberships"
          className="inline-flex mt-6 px-5 py-2.5 rounded-lg bg-brand text-white font-semibold hover:bg-brand-light"
        >
          Back to Plans
        </a>
      </div>
    );
  }

  return (
    <div className="container py-10 space-y-8">
      <div ref={topRef} className="space-y-2">
        <h1 className="text-3xl font-bold">Build Your Plan</h1>
        <p className="text-slate-600">
          Not every driver needs the same maintenance schedule. Build a plan based on your mileage, vehicle type, driving habits, and preferred services.
        </p>

        <div className="rounded-xl border bg-white p-4 text-slate-700">
          <div className="font-semibold">Estimated monthly range</div>
          <div className="mt-1">$45 to $75 per month depending on services and vehicle count</div>
          <div className="text-slate-600 text-sm mt-1">+ tax</div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {submitError ? <p className="text-red-600 mb-4">{submitError}</p> : null}
        {inlineErr.request ? <p className="text-red-600 mb-4">{inlineErr.request}</p> : null}

        <form onSubmit={submit} encType="multipart/form-data" className="space-y-4 max-w-2xl">
          <input type="hidden" name="ts" value={ts} />

          <div className="hidden" aria-hidden="true">
            <label>Company</label>
            <input type="text" name="company" autoComplete="off" />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium">Full name</label>
              <input name="name" required className="w-full border rounded px-3 py-2" />
              {inlineErr.name ? <div className="text-sm text-red-600 mt-1">{inlineErr.name}</div> : null}
            </div>
            <div>
              <label className="block text-sm font-medium">Company name (optional)</label>
              <input name="company_name" className="w-full border rounded px-3 py-2" />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium">Phone</label>
              <input name="phone" required className="w-full border rounded px-3 py-2" />
              {inlineErr.phone ? <div className="text-sm text-red-600 mt-1">{inlineErr.phone}</div> : null}
            </div>
            <div>
              <label className="block text-sm font-medium">Email</label>
              <input type="email" name="email" required className="w-full border rounded px-3 py-2" />
              {inlineErr.email ? <div className="text-sm text-red-600 mt-1">{inlineErr.email}</div> : null}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium">Service address</label>
            <input name="address" required className="w-full border rounded px-3 py-2" />
            {inlineErr.address ? <div className="text-sm text-red-600 mt-1">{inlineErr.address}</div> : null}
          </div>

          <div>
            <label className="block text-sm font-medium">Postal code</label>
            <input name="postal" required className="w-full border rounded px-3 py-2" />
            {inlineErr.postal ? <div className="text-sm text-red-600 mt-1">{inlineErr.postal}</div> : null}
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium">Oil changes per year</label>
              <input
                type="number"
                min={0}
                max={12}
                value={oilChanges}
                onChange={(e) => setOilChanges(e.target.value)}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Inspections per year</label>
              <input
                type="number"
                min={0}
                max={12}
                value={inspections}
                onChange={(e) => setInspections(e.target.value)}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Vehicle count</label>
              <input
                type="number"
                min={1}
                max={200}
                value={vehicleCount}
                onChange={(e) => setVehicleCount(e.target.value)}
                className="w-full border rounded px-3 py-2"
              />
              {inlineErr.custom_vehicle_count ? (
                <div className="text-sm text-red-600 mt-1">{inlineErr.custom_vehicle_count}</div>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-900">Select services</div>
            <div className="mt-2 grid sm:grid-cols-2 gap-2 text-slate-700">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={svcTire} onChange={(e) => setSvcTire(e.target.checked)} />
                Tire services
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={svcBattery} onChange={(e) => setSvcBattery(e.target.checked)} />
                Battery testing
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={svcFluids} onChange={(e) => setSvcFluids(e.target.checked)} />
                Fluid services
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={svcWipers} onChange={(e) => setSvcWipers(e.target.checked)} />
                Wiper replacements
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={svcLogs} onChange={(e) => setSvcLogs(e.target.checked)} />
                Maintenance logs
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={svcPriority} onChange={(e) => setSvcPriority(e.target.checked)} />
                Priority scheduling
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={svcAfterHours} onChange={(e) => setSvcAfterHours(e.target.checked)} />
                After-hours service
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium">Preferred start date</label>
            <input type="date" name="preferred_date" required className="w-full border rounded px-3 py-2" />
            {inlineErr.preferred_date ? <div className="text-sm text-red-600 mt-1">{inlineErr.preferred_date}</div> : null}
          </div>

          <div>
            <label className="block text-sm font-medium">Describe what you want included</label>
            <textarea
              name="service_issue"
              rows={5}
              required
              className="w-full border rounded px-3 py-2"
              placeholder="Mileage, vehicle types, service frequency, and what you want included."
            />
            {inlineErr.service_issue ? (
              <div className="text-sm text-red-600 mt-1">{inlineErr.service_issue}</div>
            ) : null}
          </div>

          <div>
            <label className="block text-sm font-medium">Notes (optional)</label>
            <textarea name="notes" rows={3} className="w-full border rounded px-3 py-2" />
          </div>

          <button className="w-full px-5 py-2.5 rounded-lg bg-brand text-white font-semibold hover:bg-brand-light">
            Build Your Plan
          </button>
        </form>
      </div>
    </div>
  );
}