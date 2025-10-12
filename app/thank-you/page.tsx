export default function ThankYou() {
    return (
      <div className="container py-16 text-center">
        <h1 className="text-3xl font-bold">Thanks! We received your request.</h1>
        <p className="text-slate-600 mt-3">
          We’ll confirm your time and add it to our calendar. If anything changes, we’ll text or email you.
        </p>
        <a href="/" className="inline-flex mt-6 px-5 py-2.5 rounded-lg bg-brand text-white font-semibold hover:bg-brand-light">
          Back to Home
        </a>
      </div>
    );
  }
  