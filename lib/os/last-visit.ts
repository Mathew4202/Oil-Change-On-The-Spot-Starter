// What we flagged last visit (the Soon / Now taps and the note for the customer), for HQ and for reminder texts.
// Pure, so it is tested on its own.
import { checksFrom } from "./fleet-math.ts";

export type LastVisit = { now: string[]; soon: string[]; note: string | null } | null;

export function lastVisit(inspection: Parameters<typeof checksFrom>[0], note: string | null | undefined): LastVisit {
  const c = checksFrom(inspection);
  const n = note?.trim() || null;
  if (!n && !c?.now.length && !c?.soon.length) return null;
  return { now: c?.now ?? [], soon: c?.soon ?? [], note: n };
}

// tires need a tire machine, which we don't have: never offer them in a text
export const isTires = (s: string) => /\btires?\b|\btyres?\b/i.test(s);

/** One short line for a reminder text offering what we can do, or "" when there's nothing (tires are left out). */
export function lastVisitText(v0: LastVisit): string {
  if (!v0) return "";
  const v = { now: v0.now.filter((x) => !isTires(x)), soon: v0.soon.filter((x) => !isTires(x)), note: v0.note && !isTires(v0.note) ? v0.note : null };
  if (!v.note && !v.now.length && !v.soon.length) return "";
  const items = [...v.now.map((x) => `${x.toLowerCase()} (needs doing)`), ...v.soon.map((x) => `${x.toLowerCase()} (coming up soon)`)];
  const what = [v.note ? v.note.replace(/[.\s]+$/, "") : "", items.length ? `${v.note ? "Also " : ""}${items.join(", ")}` : ""].filter(Boolean).join(". ");
  return `Last visit we noted: ${what}. We can take care of it at the same visit, just reply and we'll add it.`;
}

/** Put a line just above the sign-off ("- Mathew, ...") of a text. */
export function beforeSignoff(body: string, line: string): string {
  if (!line) return body;
  const lines = body.split("\n");
  const i = lines.map((l) => /^\s*-\s/.test(l)).lastIndexOf(true);
  if (i < 0) return `${body}\n${line}`;
  lines.splice(i, 0, line);
  return lines.join("\n");
}
