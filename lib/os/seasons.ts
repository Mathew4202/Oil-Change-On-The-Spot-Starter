// When customers can book the seasonal package (start of winter and start of summer tire season).
export type SeasonWindow = { name: string; from: string; to: string };   // "MM-DD", inclusive

// Defaults if the seasonal_windows table is empty. Edit the table in Supabase to change them.
export const DEFAULT_WINDOWS: SeasonWindow[] = [
  { name: "Winter tires", from: "10-01", to: "12-15" },
  { name: "Summer tires", from: "03-15", to: "05-31" },
];

/** date = "YYYY-MM-DD" (Halifax). Handles windows that cross New Year (e.g. 11-15 to 01-15). */
export function seasonFor(date: string, windows: SeasonWindow[] = DEFAULT_WINDOWS): SeasonWindow | null {
  const md = date.slice(5);
  for (const w of windows) {
    const inside = w.from <= w.to ? md >= w.from && md <= w.to : md >= w.from || md <= w.to;
    if (inside) return w;
  }
  return null;
}
