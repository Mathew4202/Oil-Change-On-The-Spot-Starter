// Real Google reviews for the website, fetched at most once a day (stays inside Google's free monthly calls).
// Uses the same GOOGLE_MAPS_API_KEY as the address box. Place ID: GOOGLE_PLACE_ID / NEXT_PUBLIC_GOOGLE_PLACE_ID, or found by name.
export type Review = { author: string; text: string; rating: number; when: string; url: string | null };
export type ReviewData = { rating: number | null; count: number | null; reviews: Review[]; url: string };

const DAY = 86400;
const FALLBACK: ReviewData = {
  rating: 5, count: null, url: "https://g.page/r/Cc5AP8M9qC4MEAE/review",
  reviews: [
    { author: "Olivia B.", rating: 5, when: "", url: null, text: "Great service! They came right to my house for a quick and affordable oil change. Super friendly and efficient. I'll definitely be using them again." },
    { author: "Caroline S.", rating: 5, when: "", url: null, text: "They came right to my house, making the whole process incredibly convenient. The technicians were punctual, friendly, and clearly knowledgeable about the job. They left everything clean and tidy afterward." },
    { author: "Anandkrishna L.", rating: 5, when: "", url: null, text: "Service was great and spot on! Recommend." },
  ],
};

async function placeId(key: string): Promise<string | null> {
  const fixed = process.env.GOOGLE_PLACE_ID || process.env.NEXT_PUBLIC_GOOGLE_PLACE_ID;
  if (fixed) return fixed;
  // ID-only text search is free
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.id" },
    body: JSON.stringify({ textQuery: "Oil Change On The Spot Dartmouth Nova Scotia" }), next: { revalidate: DAY * 7 },
  }).catch(() => null);
  const j = r?.ok ? await r.json().catch(() => ({})) : {};
  return j.places?.[0]?.id ?? null;
}

export async function getReviews(): Promise<ReviewData> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return FALLBACK;
  try {
    const id = await placeId(key);
    if (!id) return FALLBACK;
    const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "rating,userRatingCount,reviews,googleMapsUri" }, next: { revalidate: DAY },
    });
    if (!r.ok) return FALLBACK;
    const j = await r.json();
    const reviews: Review[] = (j.reviews ?? [])
      .filter((x: { rating?: number; text?: { text?: string } }) => (x.rating ?? 0) >= 4 && (x.text?.text ?? "").trim().length > 20)
      .slice(0, 3)
      .map((x: { authorAttribution?: { displayName?: string; uri?: string }; text?: { text?: string }; rating?: number; relativePublishTimeDescription?: string; googleMapsUri?: string }) => ({
        author: x.authorAttribution?.displayName ?? "Google user", text: (x.text?.text ?? "").trim(), rating: x.rating ?? 5,
        when: x.relativePublishTimeDescription ?? "", url: x.googleMapsUri ?? x.authorAttribution?.uri ?? null }));
    return { rating: j.rating ?? null, count: j.userRatingCount ?? null, url: j.googleMapsUri ?? FALLBACK.url, reviews: reviews.length ? reviews : FALLBACK.reviews };
  } catch { return FALLBACK; }
}
