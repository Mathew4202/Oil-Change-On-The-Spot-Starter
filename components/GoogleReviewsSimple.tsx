'use client';

export default function GoogleReviewsSimple() {
  // TODO: set your real Place ID here
  const PLACE_ID = process.env.NEXT_PUBLIC_GOOGLE_PLACE_ID;
  const cid     = process.env.NEXT_PUBLIC_GOOGLE_CID;

  const writeReviewUrl = PLACE_ID
    ? `https://search.google.com/local/writereview?placeid=${PLACE_ID}`
    : 'https://www.google.com/search?q=Oil+Change+On+The+Spot+Halifax';

  const readReviewsUrl = PLACE_ID
    ? `https://search.google.com/local/reviews?placeid=${PLACE_ID}`
  : cid
  ? `https://maps.google.com/?cid=${cid}`
  : 'https://maps.google.com'; // final fallback

  return (
    <section className="container py-12">
      <h2 className="text-2xl md:text-3xl font-bold text-center mb-4">Google Reviews</h2>
      <p className="text-center text-slate-600 mb-6">
        We’re proud of our 5-star service. See what people are saying or leave a review.
      </p>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        {/* Read reviews */}
        <a
          href={readReviewsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-lg border px-4 py-2 font-semibold text-slate-800 hover:bg-slate-50"
        >
          Read reviews
        </a>

        {/* Leave a review */}
        <a
          href={writeReviewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800"
        >
          Leave a review
        </a>
      </div>
    </section>
  );
}
