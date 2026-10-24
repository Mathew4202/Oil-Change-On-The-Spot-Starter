// The one place for the business phone number. Right now it's Mathew's own number (782-640-8341).
// When Quo is set up, set NEXT_PUBLIC_BUSINESS_PHONE in Vercel to the Quo number and every page, text and receipt follows.
const raw = process.env.NEXT_PUBLIC_BUSINESS_PHONE || "782-640-8341";
const d = raw.replace(/\D/g, "").slice(-10);
export const PHONE = d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : raw;
export const PHONE_TEL = `tel:+1${d}`;
