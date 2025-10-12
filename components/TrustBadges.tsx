export default function TrustBadges() {
  const badges = [
    'Knowledgeable Workers',
    'Eco Disposal Included',
    'Upfront Pricing',
    'We Come To You',
  ];
  return (
    <section className="bg-slate-50 border-y">
      <div className="container py-6 grid gap-3 sm:grid-cols-2 md:grid-cols-4 text-center">
        {badges.map((b, i) => (
          <div key={i} className="rounded-lg border bg-white px-4 py-3 text-sm font-medium text-slate-700">
            {b}
          </div>
        ))}
      </div>
    </section>
  );
}
