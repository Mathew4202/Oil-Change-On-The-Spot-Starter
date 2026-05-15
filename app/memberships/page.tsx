import Link from "next/link";
import Image from "next/image";

export const metadata = {
  title: "Maintenance Plans",
  description: "Personal maintenance plans and fleet maintenance programs in HRM.",
};

type PlanId = "basic" | "standard" | "premium";

type Plan = {
  id: PlanId;
  title: string;
  monthly: number;
  mobilAdd: number;
  badge?: string;
  desc: string;
  bullets: string[];
};

const PLANS: Plan[] = [
  {
    id: "basic",
    title: "Basic Care",
    monthly: 29.99,
    mobilAdd: 10,
    desc: "Perfect for lower-mileage drivers who want simple scheduled maintenance.",
    bullets: [
      "2 oil changes per year",
      "1 inspection per year",
      "Maintenance reminders",
      "Priority scheduling",
    ],
  },
  {
    id: "standard",
    title: "Standard Care",
    monthly: 44.99,
    mobilAdd: 10,
    badge: "Most Popular",
    desc: "Designed for commuters, daily drivers, and Uber drivers.",
    bullets: [
      "3 oil changes per year",
      "2 inspections per year",
      "Tire pressure and tread checks",
      "Fluid top-ups",
      "Priority scheduling",
    ],
  },
  {
    id: "premium",
    title: "Premium Care",
    monthly: 69.99,
    mobilAdd: 10,
    desc: "Built for high-mileage drivers and maximum convenience.",
    bullets: [
      "4 oil changes per year",
      "Inspection at every visit",
      "Tire rotation checks",
      "Battery testing",
      "Fluid and wiper maintenance",
      "After-hours scheduling support",
    ],
  },
];

export default function MaintenancePlansPage() {
  return (
    <div className="container py-12 space-y-10">
      <section className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Maintenance Plans</h1>
        <p className="text-slate-600">
          We service vehicles where they already are. Skip repair shop downtime and waiting rooms.
        </p>

        <div className="mt-5 rounded-xl border bg-white p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-center gap-3 text-slate-700">
            <div className="flex items-center gap-2">
              <span aria-hidden="true">✓</span>
              <span>Registered Nova Scotia business</span>
            </div>
            <div className="flex items-center gap-2">
              <span aria-hidden="true">✓</span>
              <span>Mobile service across HRM</span>
            </div>
            <div className="flex items-center gap-2">
              <span aria-hidden="true">✓</span>
              <span>Commercially insured</span>
            </div>
            <div className="flex items-center gap-2">
              <span aria-hidden="true">✓</span>
              <span>Real local customer reviews</span>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-6 shadow-sm space-y-2">
        <h2 className="text-2xl font-bold">Personal Vehicle Maintenance Plans</h2>
        <p className="text-slate-700">
          Keep your vehicle operational with on-site preventative maintenance. We track your schedule and help reduce missed services.
        </p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map((p) => (
          <article key={p.id} className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold">{p.title}</h3>
                  <p className="text-slate-600 text-sm">{p.desc}</p>
                </div>

                {p.badge ? (
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-800">
                    {p.badge}
                  </span>
                ) : null}
              </div>

              <div className="rounded-lg border bg-slate-50 p-4 space-y-2">
                <div className="text-3xl font-extrabold">
                  ${p.monthly.toFixed(2)}
                  <span className="text-base font-semibold text-slate-500"> / month</span>
                </div>
                <div className="text-sm text-slate-600">+ tax</div>

                <div className="text-sm text-slate-700">
                  Oil options
                  <ul className="list-disc ml-5 mt-1 space-y-1">
                    <li>Kirkland Full Synthetic</li>
                    <li>Mobil 1 Full Synthetic (+${p.mobilAdd}/month)</li>
                  </ul>
                </div>
              </div>

              <ul className="text-slate-700 space-y-2">
                {p.bullets.map((line, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden="true">✓</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-6 border-t bg-white">
              <Link
                href={{ pathname: "/maintenance-plan-request", query: { plan: p.id } }}
                className="block w-full text-center rounded-lg bg-blue-700 text-white font-semibold px-5 py-3 hover:bg-blue-800 transition"
              >
                Request Plan
              </Link>
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border bg-white p-7 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div className="space-y-3">
            <h2 className="text-2xl font-bold">Build Your Plan</h2>
            <p className="text-slate-700">
              Not every driver needs the same maintenance schedule. Build a plan based on your mileage, vehicle type, driving habits, and preferred services.
            </p>

            <div className="rounded-lg border bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">Estimated monthly range</div>
              <div className="text-slate-700 mt-1">$45 to $75 per month depending on services and vehicle count</div>
              <div className="text-slate-600 text-sm mt-1">+ tax</div>
            </div>
          </div>

          <Link
            href={{ pathname: "/custom-plan-request" }}
            className="inline-flex items-center justify-center rounded-lg bg-brand text-white font-semibold px-6 py-3 hover:bg-brand-light"
          >
            Build Your Plan
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-7 shadow-sm space-y-4">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold">Fleet Maintenance Programs</h2>
          <p className="text-slate-700">
            We help businesses reduce downtime by servicing vehicles on-site. We build preventative maintenance programs around your fleet schedule.
          </p>
          <p className="text-slate-700">
            Fleet vehicles stay operational while maintenance is completed.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="rounded-xl border bg-slate-50 p-5">
            <h3 className="text-lg font-semibold">How Fleet Onboarding Works</h3>
            <ol className="list-decimal ml-5 mt-3 text-slate-700 space-y-1">
              <li>Submit fleet details</li>
              <li>We review vehicle requirements</li>
              <li>We build a custom maintenance proposal</li>
              <li>We schedule on-site servicing</li>
            </ol>
          </div>

          <div className="rounded-xl border bg-slate-50 p-5">
            <h3 className="text-lg font-semibold">Common Fleet Types We Service</h3>
            <div className="mt-3 grid gap-2 text-slate-700">
              {[
                "Delivery vehicles",
                "Security fleets",
                "Contractor vehicles",
                "Service businesses",
                "Small commercial fleets",
              ].map((t) => (
                <div key={t} className="flex gap-2">
                  <span aria-hidden="true">✓</span>
                  <span>{t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="text-lg font-semibold text-slate-900">Start with a small pilot program</div>
              <div className="text-slate-700 mt-1">
                Start with 1 or 2 vehicles first so you can review our process, reliability, and reporting before expanding.
              </div>
            </div>

            <Link
              href={{ pathname: "/fleet-request" }}
              className="inline-flex items-center justify-center rounded-lg bg-blue-700 text-white font-semibold px-6 py-3 hover:bg-blue-800 transition"
            >
              Request Fleet Quote
            </Link>
          </div>
        </div>

        <div className="rounded-xl border bg-slate-50 p-4">
          <div className="text-slate-900 font-semibold mb-2">On-site service photos</div>
          <div className="grid md:grid-cols-3 gap-3">
            <div className="rounded-lg overflow-hidden border bg-white">
              <Image src="/gallery/work-18.png" alt="Tire pressure and checks" width={900} height={600} className="w-full h-auto" />
            </div>
            <div className="rounded-lg overflow-hidden border bg-white">
              <Image src="/gallery/work-21.png" alt="Tire pressure and checks" width={900} height={600} className="w-full h-auto" />
            </div>
            <div className="rounded-lg overflow-hidden border bg-white">
              <Image src="/gallery/work-19.png" alt="Tire pressure and checks" width={900} height={600} className="w-full h-auto" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}