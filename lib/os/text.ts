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

