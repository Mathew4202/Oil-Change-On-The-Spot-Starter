export const metadata = {
  title: 'Contact & Socials',
  description: 'Reach us fast during business hours. Call, text, or email.',
};

export default function ContactPage() {
  return (
    <div className="container py-12 space-y-6">
      <h1 className="text-3xl font-bold mb-3">Contact & Socials</h1>
      <p className="text-slate-600 mb-6">
        Reach us—fast responses during business hours.
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-3">Contact</h2>
          <ul className="space-y-2 text-slate-700">
            <li>
              <span className="font-semibold">Email:</span>{' '}
              <a className="text-brand underline" href="mailto:oilchangeonthespot@gmail.com">
                oilchangeonthespot@gmail.com
              </a>
            </li>
            <li>
              <span className="font-semibold">Phone:</span>{' '}
              <a className="text-brand underline" href="tel:+19024120244">(902) 412-0244</a>{' '}
              ·{' '}
              <a className="text-brand underline" href="tel:+17826408341">(782) 640-8341</a>
            </li>
            <li><span className="font-semibold">Hours:</span> Mon – Sun · 5pm–9pm</li>
            <li><span className="font-semibold">Service Area:</span> HRM & surrounding areas</li>
          </ul>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-3">Socials</h2>
          <ul className="space-y-2 text-slate-700">
            <li><a className="text-brand underline" href="https://www.instagram.com/oilchangeonthespot" target="_blank" rel="noopener noreferrer">Instagram</a></li>
            <li><a className="text-brand underline" href="https://www.facebook.com/share/1ErPmq1186/?mibextid=wwXlfr" target="_blank" rel="noopener noreferrer">Facebook</a></li>
            <li><a className="text-brand underline" href="https://www.tiktok.com/@oilchangeonthespot" target="_blank" rel="noopener noreferrer">TikTok</a></li>
            <li><a className="text-brand underline" href="https://google.com/maps?cid=877823960605999310" target="_blank" rel="noopener noreferrer">Google Maps</a></li>
          </ul>
        </section>
      </div>
    </div>
  );
}
