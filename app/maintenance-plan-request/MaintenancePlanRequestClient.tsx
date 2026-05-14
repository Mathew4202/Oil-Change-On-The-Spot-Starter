"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { VehicleClass } from "@/lib/pricing";
import { detectClassFromModel } from "@/data/vehicleClass";
import { getVariants } from "@/data/variants";
import { track } from "@/lib/analytics";

type PlanId = "basic" | "standard" | "premium";
type OilOption = "kirkland" | "mobil";

type Plan = {
  id: PlanId;
  title: string;
  monthly: number;
  mobilAdd: number;
};

const PLANS: Record<PlanId, Plan> = {
  basic: { id: "basic", title: "Basic Care", monthly: 29.99, mobilAdd: 10 },
  standard: { id: "standard", title: "Standard Care", monthly: 44.99, mobilAdd: 10 },
  premium: { id: "premium", title: "Premium Care", monthly: 69.99, mobilAdd: 10 },
};

const CA_POSTAL_RE =
  /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d$/i;

const HRM_FSAS = [
  "B2T","B2V","B2W","B2X","B2Y","B2Z",
  "B3A","B3E","B3G","B3H","B3J","B3K","B3L","B3M","B3N","B3P","B3R","B3S","B3T","B3V","B3W","B3X","B3Y","B3Z",
  "B4A","B4B","B4C","B4E",
];

type FormState = {
  planId: PlanId | "";
  oil: OilOption;

  year: number | "";
  make: string;
  model: string;
  vehicleClass: VehicleClass | "";

  makes: string[];
  models: string[];
  loadingMakes: boolean;
  loadingModels: boolean;

  engines: string[];
  trims: string[];
  engine: string;
  trim: string;
  engineFree: string;
  trimFree: string;

  startDate: string;

  postal: string;
  outOfArea: boolean;
};

const YEARS = Array.from({ length: 25 }, (_, i) => new Date().getFullYear() - i);

export default function MaintenancePlanRequestClient() {
  const searchParams = useSearchParams();
  const topRef = useRef<HTMLDivElement>(null);

  const [f, setF] = useState<FormState>({
    planId: "",
    oil: "kirkland",

    year: "",
    make: "",
    model: "",
    vehicleClass: "",

    makes: [],
    models: [],
    loadingMakes: false,
    loadingModels: false,

    engines: [],
    trims: [],
    engine: "",
    trim: "",
    engineFree: "",
    trimFree: "",

    startDate: "",

    postal: "",
    outOfArea: false,
  });

  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [ts, setTs] = useState("");

  useEffect(() => setTs(String(Date.now())), []);

  useEffect(() => {
    const p = (searchParams.get("plan") || "") as PlanId;
    if (p && (PLANS as any)[p]) {
      setF((prev) => ({ ...prev, planId: p }));
    }
  }, [searchParams]);

  const plan = useMemo(() => (f.planId ? PLANS[f.planId] : null), [f.planId]);

  const monthlyBase = useMemo(() => {
    if (!plan) return 0;
    return plan.monthly + (f.oil === "mobil" ? plan.mobilAdd : 0);
  }, [plan, f.oil]);

  useEffect(() => {
    (async () => {
      setF((p) => ({ ...p, loadingMakes: true }));
      try {
        const r = await fetch("/api/makes");
        const j = await r.json().catch(() => ({} as any));
        setF((p) => ({
          ...p,
          makes: Array.isArray(j?.makes) ? j.makes : [],
          loadingMakes: false,
        }));
      } catch {
        setF((p) => ({ ...p, makes: [], loadingMakes: false }));
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!f.make || !f.year) {
        setF((p) => ({ ...p, models: [], model: "" }));
        return;
      }
      setF((p) => ({ ...p, loadingModels: true, models: [], model: "" }));
      try {
        const r = await fetch(
          `/api/models?make=${encodeURIComponent(f.make)}&year=${encodeURIComponent(String(f.year))}`,
        );
        const j = await r.json().catch(() => ({} as any));
        setF((p) => ({
          ...p,
          models: Array.isArray(j?.models) ? j.models : [],
          loadingModels: false,
        }));
      } catch {
        setF((p) => ({ ...p, models: [], loadingModels: false }));
      }
    })();
  }, [f.make, f.year]);

  useEffect(() => {
    if (!f.model) return;

    const cls = detectClassFromModel(f.model) as VehicleClass | "" | undefined;
    const v = getVariants(f.make, f.model, Number(f.year) || undefined);

    setF((p) => ({
      ...p,
      vehicleClass: (cls || p.vehicleClass) as VehicleClass | "",
      engines: Array.isArray(v?.engines) ? v!.engines : [],
      trims: Array.isArray(v?.trims) ? v!.trims : [],
      engine: "",
      trim: "",
      engineFree: "",
      trimFree: "",
    }));
  }, [f.model, f.make, f.year]);

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

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!plan) {
      setError("Select a plan.");
      topRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    const engineChosen = f.engines.length ? f.engine : f.engineFree;
    const trimChosen = f.trims.length ? f.trim : f.trimFree;

    if (!f.year || !f.make || !f.model || !engineChosen || !trimChosen) {
      setError("Enter vehicle year, make, model, engine, and trim.");
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

    fd.set("service", "maintenance_plan");
    fd.set("year", String(f.year));
    fd.set("make", f.make);
    fd.set("model", f.model);
    fd.set("vehicleClass", f.vehicleClass || "");
    fd.set("engine", engineChosen);
    fd.set("trim", trimChosen);

    fd.set("preferred_date", f.startDate);
    fd.set("preferred_time", "");

    const oilLabel = f.oil === "mobil" ? "Mobil 1 Full Synthetic" : "Kirkland Full Synthetic";
    const planLabel = `${plan.title}, ${oilLabel}, $${monthlyBase.toFixed(2)} per month + tax`;

    fd.set("membership_plan_id", plan.id);
    fd.set("membership_plan_label", planLabel);
    fd.set("membership_monthly", String(monthlyBase));
    fd.set("membership_promo_text", "");

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
        track("maintenance_plan_request_submitted", {
          plan: plan.id,
          oil: f.oil,
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
        <h1 className="text-3xl font-bold">Request Plan</h1>
        <p className="text-slate-600">
          We service vehicles where they already are. Submit your details and we will confirm next steps.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {error ? <p className="text-red-600 mb-4">{error}</p> : null}

        <div className="grid md:grid-cols-2 gap-4 max-w-3xl">
          <div>
            <label className="block text-sm font-medium mb-2">Plan</label>
            <select
              className="w-full border rounded px-3 py-2 bg-white"
              value={f.planId}
              onChange={(e) => update("planId", e.target.value as PlanId | "")}
              required
            >
              <option value="">Select a plan</option>
              <option value="basic">Basic Care</option>
              <option value="standard">Standard Care</option>
              <option value="premium">Premium Care</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Oil option</label>
            <select
              className="w-full border rounded px-3 py-2 bg-white"
              value={f.oil}
              onChange={(e) => update("oil", e.target.value as OilOption)}
            >
              <option value="kirkland">Kirkland Full Synthetic</option>
              <option value="mobil">Mobil 1 Full Synthetic (+$10/month)</option>
            </select>
          </div>
        </div>

        {plan ? (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-700 max-w-3xl">
            <div className="font-semibold">{plan.title}</div>
            <div className="text-sm text-slate-600 mt-1">
              ${monthlyBase.toFixed(2)} / month + tax
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Vehicle Details</h2>

        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium">Year</label>
            <select
              className="w-full border rounded px-3 py-2 bg-white"
              value={f.year}
              onChange={(e) => update("year", e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">Select year</option>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium">Make</label>
            <select
              className="w-full border rounded px-3 py-2 bg-white"
              value={f.make}
              onChange={(e) => update("make", e.target.value)}
              disabled={f.loadingMakes || !f.makes.length}
            >
              <option value="">{f.loadingMakes ? "Loading makes…" : "Select make"}</option>
              {f.makes.map((mk) => (
                <option key={mk} value={mk}>
                  {mk}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium">Model</label>
            <select
              className="w-full border rounded px-3 py-2 bg-white"
              value={f.model}
              onChange={(e) => update("model", e.target.value)}
              disabled={!f.make || !f.year || f.loadingModels || !f.models.length}
            >
              <option value="">
                {!f.make || !f.year
                  ? "Choose year and make first"
                  : f.loadingModels
                  ? "Loading models…"
                  : f.models.length
                  ? "Select model"
                  : "No models found"}
              </option>
              {f.models.map((md) => (
                <option key={md} value={md}>
                  {md}
                </option>
              ))}
            </select>
          </div>
        </div>

        {f.model ? (
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium">Engine</label>
              {f.engines.length ? (
                <select
                  className="w-full border rounded px-3 py-2 bg-white"
                  value={f.engine}
                  onChange={(e) => update("engine", e.target.value)}
                  required
                >
                  <option value="">Select engine</option>
                  {f.engines.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="w-full border rounded px-3 py-2"
                  placeholder="Enter engine size, example 1.8L"
                  value={f.engineFree}
                  onChange={(e) => update("engineFree", e.target.value)}
                  required
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium">Sub model or Trim</label>
              {f.trims.length ? (
                <select
                  className="w-full border rounded px-3 py-2 bg-white"
                  value={f.trim}
                  onChange={(e) => update("trim", e.target.value)}
                  required
                >
                  <option value="">Select trim</option>
                  {f.trims.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="w-full border rounded px-3 py-2"
                  placeholder="Enter trim, example XRS"
                  value={f.trimFree}
                  onChange={(e) => update("trimFree", e.target.value)}
                  required
                />
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm max-w-xl">
        <h2 className="text-xl font-semibold mb-4">Start Date</h2>
        <div>
          <label className="block text-sm font-medium">Preferred start date</label>
          <input
            type="date"
            className="w-full border rounded px-3 py-2"
            value={f.startDate}
            onChange={(e) => update("startDate", e.target.value)}
            required
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Your Details</h2>

        <form onSubmit={submit} encType="multipart/form-data" className="space-y-4 max-w-xl">
          <input type="hidden" name="ts" value={ts} />

          <input type="hidden" name="year" value={String(f.year || "")} />
          <input type="hidden" name="make" value={f.make} />
          <input type="hidden" name="model" value={f.model} />
          <input type="hidden" name="vehicleClass" value={f.vehicleClass || ""} />
          <input type="hidden" name="engine" value={f.engines.length ? f.engine : f.engineFree} />
          <input type="hidden" name="trim" value={f.trims.length ? f.trim : f.trimFree} />
          <input type="hidden" name="preferred_date" value={f.startDate} />
          <input type="hidden" name="preferred_time" value="" />

          <input type="hidden" name="membership_plan_id" value={plan?.id || ""} />
          <input
            type="hidden"
            name="membership_plan_label"
            value={
              plan
                ? `${plan.title}, ${f.oil === "mobil" ? "Mobil 1 Full Synthetic" : "Kirkland Full Synthetic"}, $${monthlyBase.toFixed(
                    2,
                  )} per month + tax`
                : ""
            }
          />
          <input type="hidden" name="membership_monthly" value={String(monthlyBase)} />
          <input type="hidden" name="membership_promo_text" value="" />

          <div className="hidden" aria-hidden="true">
            <label>Company</label>
            <input type="text" name="company" autoComplete="off" />
          </div>

          <div>
            <label className="block text-sm font-medium">Full name</label>
            <input name="name" required className="w-full border rounded px-3 py-2" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium">Phone</label>
              <input name="phone" required className="w-full border rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium">Email</label>
              <input type="email" name="email" required className="w-full border rounded px-3 py-2" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium">Service address</label>
            <input name="address" required className="w-full border rounded px-3 py-2" />
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
            <textarea name="notes" rows={3} className="w-full border rounded px-3 py-2" />
          </div>

          <button className="w-full px-5 py-2.5 rounded-lg bg-brand text-white font-semibold hover:bg-brand-light">
            Request Plan
          </button>
        </form>
      </div>
    </div>
  );
}