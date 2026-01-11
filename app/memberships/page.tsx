// app/memberships/page.tsx
import Link from "next/link";

export const metadata = {
  title: "Memberships",
  description: "Monthly maintenance memberships. Mobile service in HRM.",
};

type PlanId =
  | "basic_kirkland"
  | "basic_mobil"
  | "standard_kirkland"
  | "standard_mobil"
  | "premium_kirkland"
  | "premium_mobil";

type Plan = {
  id: PlanId;
  tier: "Basic Care" | "Standard Care" | "Premium Care";
  oilBrand: "Kirkland Full Synthetic" | "Mobil 1 Full Synthetic";
  monthly: number;
  badge?: string;
  bullets: string[];
};

const PROMO_TITLE = "First 10 customers deal";
const PROMO_LINE_1 = "First 10 customers get $10 off per month for 24 months.";
const PROMO_LINE_2 = "Applies to any plan. While spots last.";
const PROMO_FINE_PRINT =
  "Limited to the first 10 paid signups. One per customer. Starts at signup date. Not transferable.";

const PLANS: Plan[] = [
  {
    id: "basic_kirkland",
    tier: "Basic Care",
    oilBrand: "Kirkland Full Synthetic",
    monthly: 29.99,
    bullets: [
      "2 oil changes per year",
      "1 full vehicle inspection per year",
      "Maintenance reminders handled for you",
      "Priority booking",
    ],
  },
  {
    id: "basic_mobil",
    tier: "Basic Care",
    oilBrand: "Mobil 1 Full Synthetic",
    monthly: 39.99,
    bullets: [
      "2 oil changes per year",
      "1 full vehicle inspection per year",
      "Maintenance reminders handled for you",
      "Priority booking",
    ],
  },
  {
    id: "standard_kirkland",
    tier: "Standard Care",
    oilBrand: "Kirkland Full Synthetic",
    monthly: 49.99,
    badge: "Most popular",
    bullets: [
      "3 oil changes per year",
      "Tire rotation check",
      "2 inspections per year",
      "Wiper and fluid top ups",
    ],
  },
  {
    id: "standard_mobil",
    tier: "Standard Care",
    oilBrand: "Mobil 1 Full Synthetic",
    monthly: 59.99,
    badge: "Most popular",
    bullets: [
      "3 oil changes per year",
      "Tire rotation check",
      "2 inspections per year",
      "Wiper and fluid top ups",
    ],
  },
  {
    id: "premium_kirkland",
    tier: "Premium Care",
    oilBrand: "Kirkland Full Synthetic",
    monthly: 79.99,
    bullets: [
      "4 oil changes per year",
      "Tire rotation every visit",
      "Inspection every visit",
      "Same or next day service",
      "After hours availability",
    ],
  },
  {
    id: "premium_mobil",
    tier: "Premium Care",
    oilBrand: "Mobil 1 Full Synthetic",
    monthly: 99.99,
    bullets: [
      "4 oil changes per year",
      "Tire rotation every visit",
      "Inspection every visit",
      "Same or next day service",
      "After hours availability",
      "Roadside assistance 24",
    ],
  },
];

function money(n: number) {
  return n.toFixed(2);
}

export default function MembershipsPage() {
  return (
    <div className="container py-12 space-y-8">
    
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Maintenance Memberships</h1>
        <p className="text-slate-600">
          Monthly plans. We come to you in Dartmouth and HRM.
        </p>
      </div>

      <div className="rounded-xl border bg-white p-5">
        <p className="font-semibold text-slate-900">{PROMO_TITLE}</p>
        <p className="text-slate-700">
          {PROMO_LINE_1} {PROMO_LINE_2}
        </p>
        <p className="text-slate-500 text-sm mt-1">{PROMO_FINE_PRINT}</p>
      </div>
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold">Fleet</h2>
            <p className="text-slate-700">
              Fleet pricing uses the same membership plan pricing, multiplied by
              number of vehicles.
            </p>
          </div>

          <Link
            href="/fleet-request"
            className="inline-flex items-center justify-center rounded-lg bg-brand text-white font-semibold px-5 py-3 hover:bg-brand-light"
          >
            Request a fleet quote
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {PLANS.map((p) => (
          <article
            key={p.id}
            className="rounded-xl border bg-white shadow-sm overflow-hidden"
          >
            <div className="p-5 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">{p.tier}</h2>
                  <p className="text-slate-600 text-sm">{p.oilBrand}</p>
                </div>

                {p.badge ? (
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-800">
                    {p.badge}
                  </span>
                ) : null}
              </div>

              <div className="pt-2">
                <div className="text-slate-500 text-xs uppercase tracking-wide">
                  Monthly price
                </div>
                <div className="text-3xl font-extrabold">
                  ${money(p.monthly)}
                  <span className="text-base font-semibold text-slate-500">
                    {" "}
                    / month
                  </span>
                </div>
              </div>

              <ul className="list-disc ml-5 text-slate-700 space-y-1 pt-2">
                {p.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>

            <div className="p-5 border-t bg-slate-50">
              <Link
                href={{
                  pathname: "/membership-request",
                  query: { membership: p.id },
                }}
                className="block w-full text-center rounded-lg bg-blue-700 text-white font-semibold px-4 py-2 hover:bg-blue-800 transition"
              >
                Request this membership
              </Link>

              <p className="text-xs text-slate-500 mt-2">
                You will pick a date and time for your first visit on the next
                page.
              </p>
            </div>
          </article>
        ))}
      </div>

      
    </div>
  );
}
