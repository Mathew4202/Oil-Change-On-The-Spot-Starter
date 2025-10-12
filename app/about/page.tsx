export const metadata = {
    title: 'About',
    description: 'About Oil Change On The Spot – mobile oil changes across HRM.',
  };
  
  export default function AboutPage() {
    return (
      <div className="container py-12 space-y-6">
        <h1 className="text-3xl font-bold">About Oil Change On The Spot</h1>
        <p className="text-slate-700">
          We’re a Halifax-based mobile oil change service. No waiting rooms, no upsells —
          we come to your driveway or workplace with the right oil and filter for your vehicle.
        </p>
        <p className="text-slate-700">
          Our promise: clear and cheaper pricing than dealers and mechanic shops, clean work, and fast confirmations. We service sedans,
          SUVs, trucks, and performance cars across HRM in the evenings and weekends.
        </p>
  
        <div className="rounded-xl border bg-white p-5">
          <h2 className="text-xl font-semibold mb-2">Our Story</h2>
          <p className="text-slate-700">
            Oil Change On The Spot started with a simple idea: routine maintenance shouldn’t waste your day.
            We’re local, friendly, and focused on convenience and quality.
          </p>
        </div>

         {/* Team */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">Our Team</h2>

        <div className="grid md:grid-cols-2 gap-6">
          {/* You */}
          <article className="flex gap-4 rounded-xl border bg-white p-5 shadow-sm">
            <img
              src="/images/team/matt.jpg"   // put your photo at public/images/team/matt.jpg
              alt="Mathew – Technician"
              className="h-28 w-28 rounded-xl object-cover"
            />
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">Mathew Akunyili</h3>
              <p className="text-slate-600 text-sm">
                Co-founder & lead technician. Detail-oriented, punctual, and always focused on
                doing things right the first time. I’ll treat your car like it’s mine.
              </p>
            </div>
          </article>
          {/* Harsh */}
          <article className="flex gap-4 rounded-xl border bg-white p-5 shadow-sm">
            <img
              src="/images/team/harsh.jpg"   // put Harsh’s photo at public/images/team/harsh.jpg
              alt="Harsh – Technician"
              className="h-28 w-28 rounded-xl object-cover"
            />
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">Harsh Bahorun</h3>
              <p className="text-slate-600 text-sm">
                Co-founder & technician. Friendly and efficient—Harsh keeps the workflow smooth
                and the service spotless. Ask him anything about oil specs and filters.
              </p>
            </div>
          </article>
        </div>
      </section>
      </div>
    );
  }
  