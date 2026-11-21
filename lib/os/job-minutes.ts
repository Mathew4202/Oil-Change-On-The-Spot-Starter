// Minutes on the calendar per car for each job type (pure, so the tests can run it).
export function jobMinutes(job: string | undefined, r: Record<string, number>, addons: string[] = []): number {
  if (job === "parts") return r.job_minutes_parts ?? 45;
  if (job === "diagnostic") return r.job_minutes_diagnostic ?? 60;
  if (job === "tires") return r.job_minutes_tires ?? 60;
  if (job === "rotation") return r.job_minutes_rotation ?? 60;
  if (job === "seasonal") return (r.job_minutes ?? 45) + (r.job_minutes_tires_addon ?? 45);
  // oil change, plus extra time when tires are swapped on the same visit
  return (r.job_minutes ?? 45) + (addons.includes("tires") ? r.job_minutes_tires_addon ?? 45 : 0) + (addons.includes("rotation") ? r.job_minutes_rotation ?? 60 : 0);
}


