// US dollars → Canadian dollars at the Bank of Canada's rate for that day (free, no key). Weekends and holidays have no
// rate, so the last business day before is used. Rates are kept in memory for the day.
const cache = new Map<string, number>();

export async function usdToCad(date: string): Promise<number | null> {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10);
  if (cache.has(day)) return cache.get(day)!;
  const from = new Date(new Date(`${day}T12:00:00Z`).getTime() - 10 * 86400000).toISOString().slice(0, 10);
  try {
    const res = await fetch(`${process.env.FX_BASE_URL || "https://www.bankofcanada.ca/valet"}/observations/FXUSDCAD/json?start_date=${from}&end_date=${day}`,
      { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { observations?: { d: string; FXUSDCAD?: { v: string } }[] };
    const last = (j.observations ?? []).filter((o) => o.FXUSDCAD?.v).pop();
    const rate = last ? Number(last.FXUSDCAD!.v) : NaN;
    if (!(rate > 1 && rate < 2)) return null;
    cache.set(day, rate);
    return rate;
  } catch { return null; }
}
