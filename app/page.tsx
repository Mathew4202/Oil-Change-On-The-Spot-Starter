import Link from "next/link";
import TrustBadges from '@/components/TrustBadges';
import HowItWorks from '@/components/HowItWorks';
import Testimonials from '@/components/Testimonials';
import ServiceArea from '@/components/ServiceArea';
import GoogleReviewsSimple from '@/components/GoogleReviewsSimple';
import CTAButton from "@/components/CTAButton";

export default function Home() {
  return (
    <div className="container py-16 space-y-16">
      <section className="text-center space-y-6">
  <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight">
    Mobile Oil Changes — <span className="text-brand">We come to you</span>
  </h1>

  <p className="text-slate-600 max-w-2xl mx-auto">
    Fast, clean, and affordable full-synthetic oil changes <b>across HRM</b>. We service sedans,
    SUVs, trucks, and performance cars at your home, work, or parking lot.
  </p>

  <div className="flex flex-col sm:flex-row justify-center gap-4">
    <Link href="/request" className="px-6 py-3 rounded-lg bg-brand text-white font-bold hover:bg-brand-light aria-[label]:sr-only" aria-label="Request a quote now">
      Request Quote
    </Link>
    <Link href="/services" className="px-6 py-3 rounded-lg border border-slate-300 text-slate-800 hover:bg-slate-50">
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
      <TrustBadges />
      <HowItWorks />
      <GoogleReviewsSimple />
      <Testimonials />
      <ServiceArea />

      <script
  type="application/ld+json"
  dangerouslySetInnerHTML={{
    __html: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'Do you come to my location?',
          acceptedAnswer: { '@type': 'Answer', text: 'Yes, we service HRM at your home, work, or driveway.' }
        },
        {
          '@type': 'Question',
          name: 'Is disposal included?',
          acceptedAnswer: { '@type': 'Answer', text: 'Yes, environmental disposal is included in all services.' }
        }
      ]
    })
  }}
/>

<section className="grid md:grid-cols-3 gap-6">
  {[
    [
      "Easy Booking",
      "Pick a time that works for you. We confirm your request with the right price in minutes."
    ],
    [
      "Honest Pricing",
      "Clear prices by vehicle type and oil specification. No upsells — cheaper than dealers."
    ],
    [
      "Fast & Clean",
      "We come prepared. Fresh oil, new filter, and eco-friendly disposal. No mess, no hassle."
    ],
  ].map(([t, d]) => (
    <div key={t} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-xl font-semibold mb-2">{t}</h3>
      <p className="text-slate-600">{d}</p>
    </div>
  ))}
</section>
    </div>
  )
}
