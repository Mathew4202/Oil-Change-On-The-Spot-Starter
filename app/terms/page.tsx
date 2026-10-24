import PageShell from "@/components/site/PageShell";
import { PHONE, EMAIL } from "@/components/site/brand";

export const metadata = { title: "Terms of service", description: "Booking, payment, cancellation and service terms for Oil Change On The Spot." };

export default function Terms() {
  return (
    <PageShell title="Terms of service" intro="The plain-language version of how booking with us works. Last updated October 2026.">
      <section><h2>Who we are</h2><p>Oil Change On The Spot Limited is a registered Nova Scotia business with commercial insurance. We do mobile oil changes and light maintenance at your home or work across HRM.</p></section>
      <section><h2>Prices</h2><p>Your price is worked out from your car&apos;s exact oil and filter and shown before you book, including any travel fee for addresses more than 30 km away. Prices are before HST. If the car turns out to be different from what was booked (a different engine, for example), we tell you the new price before we start.</p></section>
      <section><h2>Paying</h2><p>Pay online when you book, or after the job by card, tap, cash or e-transfer. Card payments go through our payment processor; we never see or store your full card number.</p></section>
      <section><h2>Changing or cancelling</h2><p>Please give us at least 24 hours&apos; notice to change or cancel, using the link in your confirmation text or by calling or texting {PHONE}. Same-day cancellations may have a $30 + HST fee. We waive it for emergencies and severe weather.</p></section>
      <section><h2>Diagnostics and extra work</h2><p>A diagnostic is $100 and is charged on its own, separate from any repair, even if the car can&apos;t be fixed on the spot. Repairs we can do in the driveway are $100 an hour plus parts, and only with your OK. We check fluids, filters and wipers on every visit and tell you what we find, but nothing extra is done or charged without your OK.</p></section>
      <section><h2>Weather and access</h2><p>We come in rain and snow. We only reschedule if the roads are unsafe, and we call you first. Please make sure we can safely and legally park next to the car, and leave the keys if you won&apos;t be home.</p></section>
      <section><h2>Parts you supply</h2><p>If you supply your own oil or filter, we install it as given. We can&apos;t guarantee parts we didn&apos;t supply.</p></section>
      <section><h2>Maintenance plans</h2><p>Plans run for 12 months, billed monthly plus HST, and start when you reply I AGREE to the terms we text you. They cover up to one oil change a month, and visits need 24 hours&apos; notice to change. Leaving early: you pay the regular price for the services you&apos;ve had, minus the plan payments you&apos;ve made.</p></section>
      <section><h2>Our responsibility</h2><p>We use oil that meets your engine&apos;s spec and a new filter every time. If something isn&apos;t right, call or text us. Our liability is limited to the cost of the service.</p></section>
      <section><h2>Questions</h2><p>Call or text {PHONE}, or email {EMAIL}.</p></section>
    </PageShell>
  );
}
