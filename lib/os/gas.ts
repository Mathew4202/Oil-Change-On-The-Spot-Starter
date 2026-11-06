// Gas per job, from the gas receipts: what we spent on gas in the last 60 days ÷ jobs done in that time (like the
// "Gas share" column in the old sheet). It moves by itself as gas receipts are snapped and jobs are finished.
import { sbGet } from "@/lib/os/db";
import { groupOf, beforeHst, isRealJob } from "@/lib/os/money";

let cached: { at: number; value: { perJob: number; spend: number; jobs: number } } | null = null;

export async function gasPerJob() {
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.value;
  const since = new Date(Date.now() - 60 * 86400000);
  const [exps, jobs, rule] = await Promise.all([
    sbGet<{ category: string | null; description: string | null; subtotal: number | null; total: number; hst: number | null; spent_at: string }>(
      `expenses?select=category,description,subtotal,total,hst,spent_at&spent_at=gte.${since.toISOString().slice(0, 10)}`).catch(() => []),
    sbGet<{ id: string; service: string | null }>(`jobs?select=id,service&done_at=gte.${since.toISOString()}`).then((js) => js.filter(isRealJob)).catch(() => []),
    sbGet<{ value: number }>("pricing_rules?select=value&key=eq.gas_per_job").catch(() => []),
  ]);
  const spend = Math.round(exps.filter((e) => groupOf(e.category, e.description) === "fuel").reduce((t, e) => t + beforeHst(e as never), 0) * 100) / 100;
  // too few jobs to average yet: the gas_per_job setting (default $8)
  const perJob = jobs.length >= 5 && spend > 0 ? Math.round((spend / jobs.length) * 100) / 100 : Number(rule[0]?.value ?? 8);
  const value = { perJob, spend, jobs: jobs.length };
  cached = { at: Date.now(), value };
  return value;
}
