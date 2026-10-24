import { getReviews } from "@/lib/site/reviews";
import { NAVY, GOLD, MUTED, LIGHT } from "./brand";

export default async function Reviews() {
  const r = await getReviews();
  return (
    <section id="reviews" aria-label="Reviews" className="scroll-mt-20" style={{ background: LIGHT }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 flex flex-col gap-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h2 className="text-[34px] sm:text-[40px] leading-none font-extrabold" style={{ fontFamily: "var(--font-condensed)", color: NAVY }}>What customers say</h2>
            {r.rating && <p className="mt-2 text-[17px] font-semibold"><span style={{ color: GOLD }} aria-hidden>★★★★★</span> {r.rating.toFixed(1)} on Google{r.count ? ` from ${r.count} reviews` : ""}</p>}
          </div>
          <a href={r.url} target="_blank" rel="noreferrer" className="font-bold underline" style={{ color: NAVY }}>Read all{r.count ? ` ${r.count}` : ""} reviews on Google</a>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {r.reviews.map((x, i) => (
            <figure key={i} className="bg-white rounded-2xl p-5 flex flex-col gap-3">
              <p aria-label={`${x.rating} out of 5 stars`} style={{ color: GOLD }}>{"★".repeat(Math.round(x.rating))}</p>
              <blockquote className="text-[16px] leading-relaxed line-clamp-[8]">{x.text}</blockquote>
              <figcaption className="text-sm font-semibold mt-auto" style={{ color: MUTED }}>{x.author}{x.when ? `, ${x.when}` : ""} · Google review</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
