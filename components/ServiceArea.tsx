export default function ServiceArea() {
    return (
      <section className="container py-12">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-6">Service Area</h2>
        <p className="text-center text-slate-600 mb-6">
          Dartmouth, Halifax, Bedford, Sackville & surrounding HRM.
        </p>
        <div className="overflow-hidden rounded-xl border shadow-sm">
          <iframe
            title="Service Area Map"
            loading="lazy"
            className="w-full h-[360px]"
            src="https://www.google.com/maps?q=Dartmouth%20NS&hl=en&z=11&output=embed"
          />
        </div>
      </section>
    );
  }
  