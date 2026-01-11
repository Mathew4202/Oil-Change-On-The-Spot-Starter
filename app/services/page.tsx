import Image from "next/image";
import Link from "next/link";

type ServiceKey =
  | "oil_change"
  | "tire_change"
  | "serpentine_belt"
  | "spark_plugs"
  | "ignition_coil"
  | "battery";

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
      key: "oil_change",
      title: "Oil Change Services",
      price:
        "Sedan $80 · SUV $90 · Large SUV $100 · Truck $110 · Euro varies (VW $120 · BMW/Mercedes $140)",
      img: "/serviceimages/oilchange.webp",
      alt: "Oil change service",
      desc: "Full synthetic oil and filter with eco-friendly disposal. Pricing varies by vehicle class and European brand.",
      byo: [
        "Bring oil + filter: Sedan $50, SUV $55, Large SUV $60, Truck $70 (Euro varies)",
        "Bring oil only: Sedan $55, SUV $60, Large SUV $65, Truck $80 (Euro varies)",
        "Bring filter only: Sedan $75, SUV $85, Large SUV $95, Truck $105 (Euro varies)",
      ],
    },
    {
      key: "tire_change",
      title: "Tire Change",
      price: "From $80",
      img: "/serviceimages/tirechange.webp",
      alt: "Tire change",
      desc: "Swap tires already mounted on rims. Torque to spec and set tire pressure. Tire must already be on the rim.",
      byo: [],
    },
    {
      key: "serpentine_belt",
      title: "Serpentine Belt Replacement",
      price: "From $140 labour + part cost",
      img: "/serviceimages/serpertinebelt.jpg",
      alt: "Serpentine belt",
      desc: "Replace worn accessory belt(s) to restore proper charging and cooling performance.",
      byo: [
        "Bring part: Sedan $140, SUV $150, Large SUV $170, Truck $180 Sports/Euro: $190",
      ],
    },
    {
      key: "spark_plugs",
      title: "Spark Plug Replacement",
      price: "From $160 labour + part cost",
      img: "/serviceimages/spark-plugs.jpg",
      alt: "Spark plugs",
      desc: "Install new plugs to improve performance and fuel economy. Price varies by cylinder count and access.",
      byo: [
        "Bring part: Sedan $160, SUV $150, Large SUV $170, Truck $180 Sports/Euro: $200",
      ],
    },
    {
      key: "ignition_coil",
      title: "Ignition Coil Replacement",
      price: "From $160 labour + part cost",
      img: "/serviceimages/ignition-coil.webp",
      alt: "Ignition coil",
      desc: "Diagnose and replace faulty coil(s) for smooth running. Price depends on number of coils.",
      byo: [
        "Bring part: Sedan $160, SUV $170, Large SUV $180, Truck $200 Sports/Euro: $280",
      ],
    },
    {
      key: "battery",
      title: "Battery Test & Replacement",
      price: "From $30 labour + battery cost if needed",
      img: "/serviceimages/battery.jpg",
      alt: "Battery service",
      desc: "Test and replace the battery if needed. We confirm the correct spec for your vehicle.",
      byo: [
        "Bring part: Sedan $30, SUV $40, Large SUV $50, Truck $60 Sports/Euro: $50",
      ],
    },
  ];

  return (
    <div className="container py-12">
      <h1 className="text-3xl font-bold mb-4 text-center">
        Services & Pricing
      </h1>

      <div className="mb-8 rounded-xl border bg-white p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-900">
              Save with a maintenance membership
            </p>
            <p className="text-slate-700">
              First 10 customers get $10 off per month for 24 months. Applies to
              any plan. While spots last.
            </p>
            <p className="text-slate-500 text-sm mt-1">
              Limited to the first 10 paid signups. One per customer. Starts at
              signup date. Not transferable.
            </p>
          </div>

          <Link
            href="/memberships"
            className="inline-flex items-center justify-center rounded-lg bg-blue-700 text-white font-semibold px-5 py-3 hover:bg-blue-800 transition"
          >
            View memberships
          </Link>
        </div>
      </div>

      <div className="mb-8 rounded-lg border bg-white p-4 text-slate-700">
        <h2 className="text-lg font-semibold mb-2">Popular add-ons</h2>
        <ul className="list-disc ml-5 space-y-1">
          <li>Cabin filter</li>
          <li>Wiper blades</li>
          <li>Tire pressure check</li>
        </ul>
        <p className="text-slate-600 mt-2 text-sm">
          You select these on the Request page before submitting.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {services.map((s) => (
          <article
            key={s.key}
            className="flex flex-col justify-between rounded-xl border shadow-sm overflow-hidden bg-white hover:shadow-md transition"
          >
            <div className="relative w-full h-48">
              <Image
                src={s.img}
                alt={s.alt}
                fill
                className="object-cover"
                priority
              />
            </div>

            <div className="p-4 flex-1 space-y-2">
              <h2 className="text-xl font-semibold">{s.title}</h2>
              <p className="text-blue-700 font-medium">{s.price}</p>
              <p className="text-slate-600 text-sm">{s.desc}</p>

              <div className="mt-2">
                <p className="text-sm font-semibold text-slate-800">
                  Bring your own:
                </p>
                <ul className="text-sm text-slate-600 list-disc pl-4 space-y-1 mt-1">
                  {s.byo.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="p-4 border-t bg-slate-50">
              <Link
                href={{ pathname: "/request", query: { service: s.key } }}
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
        Final price varies based on parts cost and vehicle type. Book to get a
        full instant quote.
      </div>
    </div>
  );
}
