// VIN helpers (no database or network, so tests can run them).

const MAP: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export const cleanVin = (s: string | null | undefined) => (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** 17 characters, no I, O or Q, and the check digit (9th character) adds up. North American VINs always pass this. */
export function vinOk(raw: string | null | undefined): boolean {
  const v = cleanVin(raw);
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(v)) return false;
  const sum = v.split("").reduce((t, ch, i) => t + (/\d/.test(ch) ? Number(ch) : MAP[ch]) * WEIGHTS[i], 0);
  const r = sum % 11;
  return v[8] === (r === 10 ? "X" : String(r));
}

/** Engine size from the decoder ("2.0") matched to one of our engine names ("2.0L 4-cyl"). */
export function matchEngine(displacementL: string | number | null | undefined, engines: string[]): string | null {
  const d = Number(displacementL);
  if (!d) return null;
  const size = d.toFixed(1);
  const hits = engines.filter((e) => e.match(/(\d+\.\d)\s*L?/i)?.[1] === size);
  return hits.length === 1 ? hits[0] : null;
}
