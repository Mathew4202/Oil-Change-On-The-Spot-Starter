import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="container py-16 text-center space-y-4">
      <h1 className="text-4xl font-extrabold">Page not found</h1>
      <p className="text-slate-600">The page you’re looking for doesn’t exist.</p>
      <div className="flex justify-center gap-3">
        <Link href="/request" className="px-5 py-2.5 rounded-lg bg-brand text-white font-semibold hover:bg-brand-light">
          Request Quote
        </Link>
        <Link href="/" className="px-5 py-2.5 rounded-lg border border-slate-300 hover:bg-slate-50">
          Back Home
        </Link>
      </div>
    </div>
  );
}
