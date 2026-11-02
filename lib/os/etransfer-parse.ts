// Read an Interac e-Transfer email: how much, from who, and the message (where customers put the receipt #). Pure, so it's tested.
export type Interac = { amount: number | null; sender: string | null; message: string | null; refs: number[]; deposited: boolean; incoming: boolean };

export function parseInterac(subject: string, body: string): Interac {
  const text = `${subject}\n${body}`.replace(/\r/g, "");
  const amt = text.match(/amount[^$\n]{0,20}\$\s?([\d,]+\.\d{2})/i) ?? text.match(/\$\s?([\d,]+\.\d{2})\s*\(?CAD/i) ?? text.match(/\$\s?([\d,]+\.\d{2})/);
  const sender = (subject.match(/received \$[\d,.]+\s+from\s+(.+?)(?:\s+and\s+it\s+has|\.?$)/i)?.[1]
    ?? subject.match(/e-?transfer:?\s*(.+?)\s+(?:sent you|has sent you)\s/i)?.[1]
    ?? body.match(/sent from:?\s*([^\n]+)/i)?.[1] ?? body.match(/^\s*(?:from|sender):?\s*([^\n]+)/im)?.[1] ?? body.match(/\n\s*([A-Z][^\n]{1,60}?)\s+sent you\s/i)?.[1] ?? null)?.trim().replace(/[.,]$/, "") || null;
  const message = body.match(/message:?\s*\n?\s*([^\n]+)/i)?.[1]?.trim() || null;
  // receipt numbers: "#1025", "receipt 1025", or a 4-6 digit number on its own in the message
  const pool = message ?? "";
  const refs = Array.from(new Set([...pool.matchAll(/#\s?(\d{3,6})\b/g), ...pool.matchAll(/receipt\D{0,6}(\d{3,6})\b/gi), ...pool.matchAll(/(?:^|\s)(\d{4,6})(?:\s|$)/g)].map((m) => Number(m[1]))));
  // money coming to us ("You've received", "sent you"), not our own transfer going out ("Your $474.00 transfer to ... has been deposited")
  const incoming = /you'?ve received|sent you|has sent you|funds sent from|sent from:/i.test(text) && !/^[^\n]*your \$[\d,.]+ transfer to/i.test(subject);
  return { amount: amt ? Number(amt[1].replace(/,/g, "")) : null, sender, message, refs, deposited: /deposit/i.test(text), incoming };
}

/** Same person? Every word of the customer's first name and last name shows up in the sender's name. */
export function nameMatches(sender: string | null, first: string | null, last: string | null) {
  if (!sender) return false;
  const s = sender.toLowerCase();
  const words = [first, last].filter(Boolean).map((w) => w!.toLowerCase().trim()).filter((w) => w.length > 1);
  return words.length > 0 && words.every((w) => s.includes(w));
}
