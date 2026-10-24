import PageShell from "@/components/site/PageShell";
import { EMAIL } from "@/components/site/brand";

export const metadata = { title: "Privacy policy", description: "What Oil Change On The Spot collects, why, and who helps us run the service." };

export default function Privacy() {
  return (
    <PageShell title="Privacy policy" intro="Last updated October 2026.">
      <section><h2>What we collect</h2><p>Your name, mobile number, email (if you give it), the address where we service your car, your car&apos;s year, make, model, engine and VIN (if you give it), your bookings and service history, and whether you&apos;ve paid. We don&apos;t collect or store full card numbers.</p></section>
      <section><h2>Why</h2><p>To price and book your service, come to the right place with the right parts, send your receipt and service record, and remind you when your next oil change is due.</p></section>
      <section><h2>Texts</h2><p>We text booking confirmations, a reminder the day before, a link to change or cancel, a one-time review request, and a reminder when your next oil change is due. Reply STOP to any text to stop them, and START to turn them back on.</p></section>
      <section><h2>Signing in</h2><p>If you sign in with a text code, a small cookie keeps you signed in on that phone for up to 6 months. Signing out removes it.</p></section>
      <section><h2>Who helps us run the service</h2>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>Supabase (secure database) and Vercel (website hosting)</li>
          <li>Our texting and phone provider, and Resend for emailed receipts</li>
          <li>Google Maps, to suggest your address and work out the driving distance</li>
          <li>Elavon, to process card payments</li>
          <li>Google Analytics, to see how people use the site (cookies)</li>
        </ul>
        <p className="mt-2">We don&apos;t sell your information or share it for anyone else&apos;s marketing.</p>
      </section>
      <section><h2>Your choices</h2><p>Email {EMAIL} to see, correct or delete what we have on file.</p></section>
    </PageShell>
  );
}
