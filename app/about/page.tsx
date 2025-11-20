export const metadata = {
    title: 'About',
    description: 'About Oil Change On The Spot – mobile oil changes across HRM.',
  };
  
  export default function AboutPage() {
    return (
      <div className="container py-12 space-y-6">
        <h1 className="text-3xl font-bold">About Oil Change On The Spot</h1>
        <p className="text-slate-700">
          We are a Halifax-based mobile auto service. We come to your driveway or workplace 
          so you avoid waiting rooms and lineups. We serve cars, SUVs, trucks, and performance vehicles across HRM.
        </p>
        <p className="text-slate-700">
          We give you clear pricing and honest service. No upsells, 
          no pressure. We come to your home or workplace at a time that 
          fits your schedule. You get clean work, fast response, and reliable 
          communication. Our focus is convenience, safety, and quality for your vehicle.
        </p>
  
        <div className="rounded-xl border bg-white p-5">
          <h2 className="text-xl font-semibold mb-2">Our Story</h2>
          <p className="text-slate-700">
           Oil Change On The Spot started with a simple idea. Routine car care should not waste your day. We began with mobile oil changes in Halifax. We focused on clear pricing, honest work, and fast service at your home or workplace.

As demand grew, customers asked for more. We listened. We expanded from oil changes into a wider set of auto services. This includes tire work, basic maintenance, inspections, and light repairs. Our goal is to give you convenient service without long waits or dealership costs.

We stay focused on quality, safety, and your experience. Our team delivers reliable work and clear communication every time. We look after your car the same way we look after ours.
          </p>
        </div>

         {/* Team */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">Our Team</h2>

        <div className="grid md:grid-cols-2 gap-6">
          {/* You */}
          <article className="flex gap-4 rounded-xl border bg-white p-5 shadow-sm">
            <img
              src="/images/team/matt.png"   // put your photo at public/images/team/matt.jpg
              alt="Mathew – Technician"
              className="h-28 w-28 rounded-xl object-cover"
            />
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">Mathew Akunyili</h3>
              <p className="text-slate-600 text-sm">
                Co-founder and lead technician. Detail oriented and focused on doing the job right the first time. 
                Mathew handles each car with care and treats your service like it is his own.
              </p>
            </div>
          </article>
          {/* Harsh */}
          <article className="flex gap-4 rounded-xl border bg-white p-5 shadow-sm">
            <img
              src="/images/team/harsh.png"   // put Harsh’s photo at public/images/team/harsh.jpg
              alt="Harsh – Technician"
              className="h-28 w-28 rounded-xl object-cover"
            />
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">Harsh Bahorun</h3>
              <p className="text-slate-600 text-sm">
                Co-founder and technician. Friendly and efficient. Harsh keeps the workflow 
                smooth and the service consistent. He handles filters, oil, and other basic maintenance with steady and reliable work.
              </p>
            </div>
          </article>
        </div>
      </section>
      </div>
    );
  }
  