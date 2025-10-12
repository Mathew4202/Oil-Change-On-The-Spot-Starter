export default function Testimonials() {
    const quotes = [
      { name: 'Olivia B.', text: 'Great service! They came right to my house for a quick and affordable oil change. Super friendly and efficient. I’ll definitely be using them again' },
      { name: 'Caroline S.', text: "I recently had the pleasure of using Oil Change on the Spot, and I couldn't be more impressed! They came right to my house, making the whole process incredibly convenient. The technicians were punctual, friendly, and clearly knowledgeable about the job. What really stood out was how fast and efficient they were. They completed the oil change in no time without sacrificing quality. It was evident they took pride in their work, as they left everything clean and tidy afterward. No mess, no fuss—just a job well done! Overall, I highly recommend this mobile oil changer service to anyone looking for a hassle-free way to maintain their vehicle. They exceeded my expectations in every way! Thanks guys!! Job well done!!" },
      { name: 'Anandkrishna L.', text: 'Service was great and spot on! recommend👌 ' },
    ];
    return (
      <section className="container py-12">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-8">What Customers Say</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {quotes.map((q, i) => (
            <figure key={i} className="rounded-xl border bg-white p-6 shadow-sm">
              <div className="text-slate-700">“{q.text}”</div>
              <figcaption className="mt-3 text-sm font-semibold text-slate-900">— {q.name}</figcaption>
            </figure>
          ))}
        </div>
      </section>
    );
  }
  