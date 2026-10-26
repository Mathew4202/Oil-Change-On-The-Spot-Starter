// Who our emails come from. EMAIL_FROM can be just an address (receipts@oilchangeonthespot.ca): the business name is
// always shown as the sender, so inboxes say "Oil Change On The Spot", never the part before the @.
export function emailFrom() {
  const raw = (process.env.EMAIL_FROM || "onboarding@resend.dev").trim();
  if (/<[^>]+>/.test(raw)) return raw.replace(/^[^<]*</, "Oil Change On The Spot <");
  return `Oil Change On The Spot <${raw}>`;
}
