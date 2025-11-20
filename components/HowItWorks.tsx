export default function HowItWorks() {
    const items = [
      { title: 'Request a Quote', text: 'Tell us your vehicle and pick a time that works.' },
      { title: 'We Come to You', text: 'Home, work, or parking lot — fully mobile service.' },
      { title: 'You’re Done', text: 'Brand New Parts, and working vehicle again, Fresh oil, new filter, eco-friendly disposal included.' },
    ];
  
    return (
      <section className="container py-12">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-8">How It Works</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {items.map((it, i) => (
            <div key={i} className="rounded-xl border bg-white p-6 shadow-sm">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-700 text-white font-bold">{i+1}</div>
              <h3 className="text-lg font-semibold">{it.title}</h3>
              <p className="text-slate-600 mt-1">{it.text}</p>
            </div>
          ))}
        </div>
      </section>
    );
  }
  