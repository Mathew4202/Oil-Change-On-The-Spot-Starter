// app/fleet-request/FleetRequestClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { track } from "@/lib/analytics";

type MembershipId =
  | "basic_kirkland"
  | "basic_mobil"
  | "standard_kirkland"
  | "standard_mobil"
  | "premium_kirkland"
  | "premium_mobil";

type Plan = {
  id: MembershipId;
  label: string;
  monthly: number;
};

const PLANS: Record<MembershipId, Plan> = {
  basic_kirkland: {
    id: "basic_kirkland",
    label: "Basic Care, Kirkland Full Synthetic",
    monthly: 29.99,
  },
  basic_mobil: {
    id: "basic_mobil",
    label: "Basic Care, Mobil 1 Full Synthetic",
    monthly: 39.99,
  },
  standard_kirkland: {
    id: "standard_kirkland",
    label: "Standard Care, Kirkland Full Synthetic",
    monthly: 49.99,
  },
  standard_mobil: {
    id: "standard_mobil",
    label: "Standard Care, Mobil 1 Full Synthetic",
    monthly: 59.99,
  },
  premium_kirkland: {
    id: "premium_kirkland",
    label: "Premium Care, Kirkland Full Synthetic",
    monthly: 79.99,
  },
  premium_mobil: {
    id: "premium_mobil",
    label: "Premium Care, Mobil 1 Full Synthetic",
    monthly: 99.99,
  },
};

function money(n: number) {
  return n.toFixed(2);
}

const CA_POSTAL_RE =
  /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d$/i;

const HRM_FSAS = [
  "B2T",
  "B2V",
  "B2W",
  "B2X",
  "B2Y",
  "B2Z",
  "B3A",
  "B3E",
  "B3G",
  "B3H",
  "B3J",
  "B3K",
  "B3L",
  "B3M",
  "B3N",
  "B3P",
  "B3R",
  "B3S",
  "B3T",
  "B3V",
  "B3W",
  "B3X",
  "B3Y",
  "B3Z",
  "B4A",
  "B4B",
  "B4C",
  "B4E",
];

type FormState = {
  planId: MembershipId | "";
  fleetCount: number;

  companyName: string;

  vehicleList: string;
  vehicleListFileName: string;

  startDate: string;

  postal: string;
  outOfArea: boolean;
};

export default function FleetRequestClient() {
  const searchParams = useSearchParams();
  const topRef = useRef<HTMLDivElement>(null);

  const [f, setF] = useState<FormState>({
    planId: "",
    fleetCount: 1,

    companyName: "",

    vehicleList: "",
    vehicleListFileName: "",

    startDate: "",

    postal: "",
    outOfArea: false,
  });

  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [ts, setTs] = useState("");
  useEffect(() => setTs(String(Date.now())), []);

  useEffect(() => {
    const planParam = (searchParams.get("plan") || "") as MembershipId;
    if (planParam && (PLANS as any)[planParam]) {
      setF((p) => ({ ...p, planId: planParam }));
    }
  }, [searchParams]);

  const plan = useMemo(() => (f.planId ? PLANS[f.planId] : null), [f.planId]);

  const fleetQty = useMemo(() => {
    const n = Number.isFinite(f.fleetCount) ? f.fleetCount : 0;
    return Math.max(1, Math.min(999, Math.floor(n)));
  }, [f.fleetCount]);

  const totalMonthly = useMemo(() => {
    if (!plan) return 0;
    return plan.monthly * fleetQty;
  }, [plan, fleetQty]);

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

  const normalizeLines = (raw: string) => {
    const lines = String(raw || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);

    if (!lines.length) return [];

    const first = lines[0].toLowerCase();
    const looksLikeHeader =
      first.includes("year") && first.includes("make") && first.includes("model");
    if (looksLikeHeader) return lines.slice(1);

    return lines;
  };

  const splitFields = (line: string) => {
    const hasComma = line.includes(",");
    const parts = hasComma ? line.split(",") : line.split("\t");
    return parts.map((x) => x.trim()).filter((x) => x.length > 0);
  };

  const validateVehicleList = (raw: string, expectedCount: number) => {
    const lines = normalizeLines(raw);

    if (lines.length === 0) {
      return { ok: false as const, msg: "Paste your fleet list. One vehicle per line." };
    }

    if (lines.length !== expectedCount) {
      return {
        ok: false as const,
        msg: `Your fleet count is ${expectedCount}, but your list has ${lines.length} vehicle lines.`,
      };
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const parts = splitFields(line);

      if (parts.length < 5) {
        return {
          ok: false as const,
          msg: `Line ${i + 1} is missing details. Format: Year, Make, Model, Engine, Trim.`,
        };
      }

      const year = parts[0] || "";
      const make = parts[1] || "";
      const model = parts[2] || "";
      const engine = parts[3] || "";
      const trim = parts[4] || "";

      if (!year || !make || !model || !engine || !trim) {
        return {
          ok: false as const,
          msg: `Line ${i + 1} must include Year, Make, Model, Engine, and Trim.`,
        };
      }
    }

    return { ok: true as const, lines };
  };

  const onVehicleFile = async (file: File | null) => {
    if (!file) {
      setF((p) => ({ ...p, vehicleListFileName: "" }));
      return;
    }

    const name = file.name || "";
    const lower = name.toLowerCase();

    const isTxt = lower.endsWith(".txt");
    const isCsv = lower.endsWith(".csv");

    if (!isTxt && !isCsv) {
      setError("Upload a CSV or TXT file.");
      return;
    }

    try {
      const text = await file.text();
      const trimmed = text.trim();
      if (!trimmed) {
        setError("Your file is empty.");
        return;
      }

      setError(null);
      setF((p) => ({
        ...p,
        vehicleList: trimmed,
        vehicleListFileName: name,
      }));
    } catch {
      setError("Could not read that file.");
    }
  };

  async function submitFleet(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!f.planId) {
      setError("Select a fleet plan.");
      topRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    if (!f.startDate) {
      setError("Pick a preferred start date.");
      topRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    const listCheck = validateVehicleList(f.vehicleList, fleetQty);
    if (!listCheck.ok) {
      setError(listCheck.msg);
      topRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    const selected = PLANS[f.planId];
    const form = e.currentTarget;
    const fd = new FormData(form);

    fd.set("postal", f.postal);
    fd.set("outOfArea", f.outOfArea ? "true" : "false");

    fd.set("service", "oil_change");

    fd.set("preferred_date", f.startDate);
    fd.set("preferred_time", "");

    fd.set("price_base", String(totalMonthly));
    fd.set("price_addons", "0");
    fd.set("discount", "0");
    fd.set("price_total", String(totalMonthly));
    fd.set("addons", "None selected");

    fd.set("fleet_count", String(fleetQty));
    fd.set("fleet_plan_id", selected.id);
    fd.set(
      "fleet_plan_label",
      `${selected.label}, $${money(selected.monthly)} per vehicle per month`,
    );
    fd.set("fleet_vehicle_monthly", String(selected.monthly));
    fd.set("fleet_total_monthly", String(totalMonthly));

    fd.set("company_name", f.companyName);

    fd.set("fleet_vehicle_list", f.vehicleList || "");
    fd.set("fleet_vehicle_list_filename", f.vehicleListFileName || "");

    fd.set("ts", ts);

    try {
      const r = await fetch("/api/quote-email", { method: "POST", body: fd });
      const isJson = r.headers.get("content-type")?.includes("application/json");
      const j = isJson ? await r.json() : { error: await r.text() };
      if (!r.ok || j?.error) throw new Error(j?.error || "Could not send request");

      setDone(true);
      try {
        track("fleet_request_submitted", {
          plan: f.planId,
          fleetCount: fleetQty,
          outOfArea: f.outOfArea,
        });
      } catch {}
      form.reset();
      setTs(String(Date.now()));
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    }
  }

  if (done) {
    return (
      <div className="container py-16 text-center">
        <h1 className="text-3xl font-bold">Request Sent</h1>
        <p className="mt-3 text-slate-600">
          Thanks. We emailed your fleet request to our team. We will confirm your start date soon.
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
    <div className="container py-10 space-y-8">
      <div ref={topRef} className="space-y-2">
        <h1 className="text-3xl font-bold">Fleet Request</h1>
        <p className="text-slate-600">Enter number of vehicles, pick a plan, then send your request.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Fleet pricing</h2>
            <p className="text-slate-600">Monthly total equals plan price times number of vehicles.</p>
          </div>

          <Link
            href="/memberships"
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-800 hover:bg-slate-50"
          >
            View membership plans
          </Link>
        </div>

        <div className="mt-4 grid md:grid-cols-2 gap-4 max-w-3xl">
          <div>
            <label className="block text-sm font-medium mb-2">Number of vehicles</label>
            <input
              type="number"
              min={1}
              max={999}
              value={f.fleetCount}
              onChange={(e) => update("fleetCount", Number(e.target.value))}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Fleet plan</label>
            <select
              className="w-full border rounded px-3 py-2 bg-white"
              value={f.planId}
              onChange={(e) => update("planId", e.target.value as MembershipId | "")}
              required
            >
              <option value="">Select a plan</option>
              {Object.values(PLANS).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}, ${money(p.monthly)} per vehicle per month
                </option>
              ))}
            </select>
          </div>
        </div>

        {plan ? (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-700 max-w-3xl">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="font-semibold">{plan.label}</div>
                <div className="text-sm text-slate-600">
                  ${money(plan.monthly)} per vehicle per month
                </div>
                <div className="text-sm text-slate-600 mt-1">Vehicles: {fleetQty}</div>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase tracking-wide text-slate-500">Estimated Monthly Total</div>
                <div className="text-2xl font-extrabold">${money(totalMonthly)}</div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm max-w-xl">
        <h2 className="text-xl font-semibold mb-4">Company</h2>
        <div>
          <label className="block text-sm font-medium">Company name (optional)</label>
          <input
            value={f.companyName}
            onChange={(e) => update("companyName", e.target.value)}
            className="w-full border rounded px-3 py-2"
            placeholder="Example: ABC Delivery"
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-2">Fleet vehicle list</h2>
        <p className="text-slate-600 text-sm">
          Required for every fleet size. One vehicle per line.
          Use comma separated values.
          Format: Year, Make, Model, Engine, Trim
        </p>

        <div className="mt-4 grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Upload CSV or TXT</label>
            <input
              type="file"
              accept=".csv,.txt"
              className="w-full border rounded px-3 py-2 bg-white"
              onChange={(e) => onVehicleFile(e.target.files?.[0] || null)}
            />
            {f.vehicleListFileName ? (
              <p className="text-xs text-slate-500 mt-1">Loaded: {f.vehicleListFileName}</p>
            ) : null}

            <div className="mt-3 text-xs text-slate-500">
              Example lines:
              <br />
              2010, Toyota, Corolla, 1.8L, XRS
              <br />
              2018, Ford, Transit, 3.7L, Base
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Paste list</label>
            <textarea
              rows={10}
              className="w-full border rounded px-3 py-2"
              value={f.vehicleList}
              onChange={(e) => update("vehicleList", e.target.value)}
              placeholder="One vehicle per line. Year, Make, Model, Engine, Trim"
              required
            />
            <div className="text-xs text-slate-500 mt-1">
              Your list must have exactly {fleetQty} vehicle lines.
            </div>
          </div>
        </div>
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
        {error ? <p className="text-red-600 mb-4">{error}</p> : null}

        <form onSubmit={submitFleet} encType="multipart/form-data" className="space-y-4 max-w-xl">
          <input type="hidden" name="ts" value={ts} />

          <input type="hidden" name="service" value="oil_change" />
          <input type="hidden" name="preferred_date" value={f.startDate} />
          <input type="hidden" name="preferred_time" value="" />

          <input type="hidden" name="price_base" value={String(totalMonthly)} />
          <input type="hidden" name="price_addons" value="0" />
          <input type="hidden" name="discount" value="0" />
          <input type="hidden" name="price_total" value={String(totalMonthly)} />
          <input type="hidden" name="addons" value="None selected" />

          <input type="hidden" name="fleet_count" value={String(fleetQty)} />
          <input type="hidden" name="fleet_plan_id" value={f.planId || ""} />
          <input
            type="hidden"
            name="fleet_plan_label"
            value={plan ? `${plan.label}, $${money(plan.monthly)} per vehicle per month` : ""}
          />
          <input type="hidden" name="fleet_vehicle_monthly" value={plan ? String(plan.monthly) : ""} />
          <input type="hidden" name="fleet_total_monthly" value={String(totalMonthly)} />
          <input type="hidden" name="company_name" value={f.companyName || ""} />

          <input type="hidden" name="fleet_vehicle_list" value={f.vehicleList || ""} />
          <input type="hidden" name="fleet_vehicle_list_filename" value={f.vehicleListFileName || ""} />

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
                Outside of service area. We will see what we are able to do.
              </div>
            ) : null}
          </div>

          <div>
            <label className="block text-sm font-medium">Notes (optional)</label>
            <textarea name="notes" rows={3} className="w-full border rounded px-3 py-2" />
          </div>

          <button className="w-full px-5 py-2.5 rounded-lg bg-brand text-white font-semibold hover:bg-brand-light">
            Submit fleet request
          </button>
        </form>
      </div>
    </div>
  );
}
