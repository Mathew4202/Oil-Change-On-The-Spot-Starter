import Image from "next/image";
import Link from "next/link";

type ServiceKey = "sedan" | "suv" | "large" | "truck" | "sports";

type ServiceCard = {
  key: ServiceKey;
  title: string;
  price: string;
  img: string;
  alt: string;
  desc: string;
  byo: string[];
};

export default function Services() {
  const services: ServiceCard[] = [
    {
      key: "sedan",
      title: "Sedans (Full Synthetic)",
      price: "From $80",
      img: "/images/sedan.png",
      alt: "Sedan",
      desc:
        "Affordable oil change for compact and mid-size sedans. Includes premium full synthetic oil, filter, and disposal.",
      byo: ["Bring oil + filter: $50", "Bring oil only: $55", "Bring filter only: $75"],
    },
    {
      key: "suv",
      title: "SUVs & Crossovers (Full Synthetic)",
      price: "From $90",
      img: "/images/suv.png",
      alt: "Mid-Size SUV",
      desc:
        "Reliable oil change for small and mid-size SUVs/crossovers. Full synthetic oil, filter, and eco-friendly disposal.",
      byo: ["Bring oil + filter: $55", "Bring oil only: $60", "Bring filter only: $85"],
    },
    {
      key: "large",
      title: "Large SUVs (Full Synthetic)",
      price: "From $100",
      img: "/images/large-suv.png",
      alt: "Large 7-seater SUV",
      desc:
        "For larger 7-seater SUVs with higher oil capacity. Includes full synthetic oil, filter, and disposal.",
      byo: ["Bring oil + filter: $60", "Bring oil only: $65", "Bring filter only: $95"],
    },
    {
      key: "truck",
      title: "Heavy Duty Trucks / V8 Engines",
      price: "From $110",
      img: "/images/truck.png",
      alt: "Pickup truck",
      desc:
        "Professional oil change for pickup trucks and V8 engines. Premium synthetic oil and filter service.",
      byo: ["Bring oil + filter: $70", "Bring oil only: $80", "Bring filter only: $105"],
    },
    {
      key: "sports",
      title: "Performance & European Vehicles",
      price: "Varies (VW from $120 · BMW from $140)",
      img: "/images/euro.png",
      alt: "European performance car",
      desc:
        "Specialized service for VW, Audi, BMW, Mercedes, etc. Premium oil/filters tailored for high-performance engines.",
      byo: ["Bring oil + filter: $70", "Bring oil only: $80", "Bring filter only: varies"],
    },
  ];

  return (
    <div className="container py-12">
      <h1 className="text-3xl font-bold mb-8 text-center">Services & Pricing</h1>

      {/* Add-ons info */}
      <div className="mb-8 rounded-lg border bg-white p-4 text-slate-700">
        <h2 className="text-lg font-semibold mb-2">Popular add-ons</h2>
        <ul className="list-disc ml-5 space-y-1">
          <li>Cabin filter</li>
          <li>Wiper blades</li>
          <li>Tire pressure check</li>
        </ul>
        <p className="text-slate-600 mt-2 text-sm">
          You can select these on the Request page before submitting.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {services.map((s) => (
          <article
            key={s.key}
            className="flex flex-col justify-between rounded-xl border shadow-sm overflow-hidden bg-white hover:shadow-md transition"
          >
            {/* Use next/image for perf (make sure /images/* exist) */}
            <div className="relative w-full h-48">
              <Image src={s.img} alt={s.alt} fill className="object-cover" priority />
            </div>

            <div className="p-4 flex-1 space-y-2">
              <h2 className="text-xl font-semibold">{s.title}</h2>
              <p className="text-blue-700 font-medium">{s.price}</p>
              <p className="text-slate-600 text-sm">{s.desc}</p>

              {/* BYO block */}
              <div className="mt-2">
                <p className="text-sm font-semibold text-slate-800">Bring your own:</p>
                <ul className="text-sm text-slate-600 list-disc pl-4 space-y-1 mt-1">
                  {s.byo.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="p-4 border-t bg-slate-50">
              <Link
                href={`/request?class=${s.key}`}
                className="block text-center w-full bg-blue-700 text-white font-semibold py-2 px-4 rounded hover:bg-blue-800 transition"
                aria-label={`Book ${s.title} now`}
              >
                Book Now
              </Link>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-8 text-center text-slate-600">
        Final price may vary by oil capacity and filter cost. Book to get an instant quote.
      </div>
    </div>
  );
}
