import Link from "next/link";
import Image from "next/image";
import TrustBadges from "@/components/TrustBadges";
import HowItWorks from "@/components/HowItWorks";
import Testimonials from "@/components/Testimonials";
import ServiceArea from "@/components/ServiceArea";
import GoogleReviewsSimple from "@/components/GoogleReviewsSimple";

// Christmas promo toggle – set to false or comment out after Christmas
const CHRISTMAS_PROMO_ACTIVE = true;

export default function Home() {
  return (
    <div className="container py-16 space-y-16">
      {/* Hero */}
      <section className="text-center space-y-6">
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight">
          Mobile Auto Services - <span className="text-brand">We come to you</span>
        </h1>

        <p className="text-slate-600 max-w-2xl mx-auto">
          Fast, clean, and affordable full-synthetic oil changes, tire changes (on rims),
          serpentine belt replacement, spark plug replacement, ignition coil replacement,
          battery test and replacement, and other services on request across HRM. We service
          sedans, SUVs, trucks, and performance cars at your home, work, or parking lot.
        </p>

        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <Link
            href="/services"
            className="px-6 py-3 rounded-lg border border-slate-300 text-slate-800 hover:bg-slate-50"
          >
            Services & Pricing
          </Link>
          <Link
            href="/contact"
            className="px-6 py-3 rounded-lg bg-yellow-400 text-blue-900 font-bold shadow-sm hover:bg-yellow-500 focus:outline-none focus:ring-2 focus:ring-yellow-300"
          >
            Our Contact Info
          </Link>
        </div>
      </section>

      {/* Christmas promo banner */}
      {CHRISTMAS_PROMO_ACTIVE && (
        <section className="rounded-2xl bg-slate-900 text-white px-6 py-8 md:px-10">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="flex-1 text-center md:text-left">
              <h2 className="text-2xl font-bold mb-2">
                Christmas special, $10 off your next service
              </h2>
              <p className="text-slate-200 mb-4">
                Limited time offer for bookings made from December 1st - January 1st.
              </p>
              <Link
                href="/request"
                className="inline-flex px-5 py-2.5 rounded-lg bg-brand text-white font-semibold hover:bg-brand-light"
              >
                Request a quote
              </Link>
            </div>
            <div className="flex-1 w-full">
              {/* Poster image */}
              <Image
                src="/promo/christmas-10off.png"
                alt="$10 off Christmas promo"
                width={800}
                height={500}
                className="w-full h-auto rounded-lg shadow-lg object-cover"
              />
            </div>
          </div>
        </section>
      )}

      <TrustBadges />
      <HowItWorks />
      <GoogleReviewsSimple />
      <Testimonials />
      <ServiceArea />

      {/* FAQ schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: [
              {
                "@type": "Question",
                name: "Do you come to my location?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Yes, we service HRM at your home, work, or driveway.",
                },
              },
              {
                "@type": "Question",
                name: "Is disposal included?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Yes, environmental disposal is included in all services.",
                },
              },
            ],
          }),
        }}
      />

      {/* Three info cards */}
      <section className="grid md:grid-cols-3 gap-6">
        {[
          [
            "Easy Booking",
            "Pick a time that works for you. We confirm your request with the right price in minutes.",
          ],
          [
            "Honest Pricing",
            "Clear prices by vehicle type and oil specification. No upsells, cheaper than dealers.",
          ],
          [
            "Fast & Clean",
            "We come prepared with fresh oil, new filter, and eco-friendly disposal.",
          ],
        ].map(([t, d]) => (
          <div
            key={t}
            className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <h3 className="text-xl font-semibold mb-2">{t}</h3>
            <p className="text-slate-600">{d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
