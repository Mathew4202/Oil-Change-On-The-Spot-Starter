// Message helpers with no database or network use (so they can be tested).
export function fill(body: string, vars: Record<string, string>): string {
  return body.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

/** Rough SMS segment count (emoji/accents switch to the 70-character Unicode limit). */
export function segments(text: string): number {
  const unicode = /[^\n\r\x20-\x7E£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ¡ÄÖÑÜ§¿äöñüà€]/.test(text);
  const single = unicode ? 70 : 160, multi = unicode ? 67 : 153;
  const len = [...text].length;
  return len <= single ? 1 : Math.ceil(len / multi);
}

// Quo charges per segment. Plain characters fit 160 per segment (153 when split); one curly quote, dash or emoji
// switches the whole text to 70 (67), so it costs 2 to 3 times more. Swap them for plain ones before sending.
const SWAP: [RegExp, string][] = [[/[\u2018\u2019\u201A\u2032\u00B4]/g, "'"], [/[\u201C\u201D\u201E\u2033]/g, '"'], [/[\u2013\u2014\u2212]/g, "-"],
  [/\u2026/g, "..."], [/[\u00A0\u2007\u202F]/g, " "], [/[\u2022\u00B7]/g, "-"], [/\u00D7/g, "x"]];
export function plainText(s: string) {
  let t = s;
  for (const [re, to] of SWAP) t = t.replace(re, to);
  return t;
}
