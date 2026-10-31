// Where the money is: profit per hour by area, by service, and what the add-ons bring in.
// Hours = time booked at the stop plus the drive out to it (straight-line km from home x 1.3, at about 40 km/h).
// Pure (no database), so it is tested on its own. Old imported jobs have no booked time: they count toward
// totals but not toward the per-hour figure.

export type HourJob = {
  revenue: number | null; cost_oil: number | null; cost_parts: number | null; cost_other: number | null;
  service: string | null; lines: { label: string; amount: number }[] | null;
  address: string | null; minutes: number | null; driveKm: number | null;
};
export type Bucket = { name: string; jobs: number; revenue: number; profit: number; hours: number | null; perHour: number | null };

const AREAS: [RegExp, string][] = [
  [/eastern passage|cow bay/i, "Eastern Passage"], [/cole harbou?r|westphal|lake loon/i, "Cole Harbour"],
  [/lower sackville|middle sackville|upper sackville|\bsackville\b/i, "Sackville"], [/fall river|waverley|wellington|windsor junction/i, "Fall River"],
  [/hammonds plains|kingswood|tantallon|upper tantallon|timberlea|lakeside|beechville/i, "Hammonds Plains / Timberlea"],
  [/porters lake|lawrencetown|musquodoboit|chezzetcook/i, "Porters Lake / Eastern Shore"],
  [/bedford/i, "Bedford"], [/dartmouth|burnside|woodside|portland hills|montebello|crichton/i, "Dartmouth"],
  [/spryfield|herring cove|purcell'?s cove/i, "Spryfield"], [/halifax|clayton park|fairview|armdale|rockingham/i, "Halifax"],
  [/enfield|elmsdale/i, "Enfield / Elmsdale"],
];
export const areaOf = (address: string | null) => {
  if (!address) return "No address on file";
  for (const [re, name] of AREAS) if (re.test(address)) return name;
  return "Other";
};

export function serviceOf(service: string | null) {
  const s = (service || "").toLowerCase();
  if (/seasonal/.test(s)) return "Seasonal package";
  if (/diagnos/.test(s)) return "Diagnostic";
  if (/tire/.test(s)) return /oil/.test(s) ? "Oil change + tires" : "Tires";
  if (/oil/.test(s)) return "Oil change";
  if (/plan_payment|cancel/.test(s)) return null;   // not a visit
  return "Other work";
}

const ADDONS: [RegExp, string][] = [
  [/wiper/i, "Wipers"], [/cabin/i, "Cabin air filter"], [/engine( air)? filter|air filter(?!.*cabin)/i, "Engine air filter"],
  [/battery/i, "Battery"], [/coolant|antifreeze/i, "Coolant top-up"], [/washer/i, "Washer fluid"], [/tire/i, "Tire change"],
];
/** The add-ons on a job, from its receipt lines (new jobs) or its service text (imported ones). */
export function addonsOn(j: Pick<HourJob, "service" | "lines">) {
  const found: { name: string; amount: number | null }[] = [];
  const lines = (j.lines ?? []).filter((l) => !/oil change|inspection|discount|credit|christmas|referral|travel|hst/i.test(l.label));
  for (const [re, name] of ADDONS) {
    const l = lines.find((x) => re.test(x.label));
    if (l) found.push({ name, amount: Number(l.amount) });
    else if (!j.lines?.length && re.test(j.service || "") && !(name === "Tire change" && !/oil/i.test(j.service || ""))) found.push({ name, amount: null });
  }
  return found;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const profitOf = (j: HourJob) => Number(j.revenue ?? 0) - Number(j.cost_oil ?? 0) - Number(j.cost_parts ?? 0) - Number(j.cost_other ?? 0);
const hoursOf = (j: HourJob) => (j.minutes && j.minutes > 0 ? j.minutes / 60 + (j.driveKm ?? 0) / 40 : null);

function bucket(jobs: HourJob[], key: (j: HourJob) => string | null): Bucket[] {
  const m = new Map<string, { jobs: number; revenue: number; profit: number; hours: number; timedProfit: number; timed: number }>();
  for (const j of jobs) {
    const k = key(j); if (!k) continue;
    const b = m.get(k) ?? { jobs: 0, revenue: 0, profit: 0, hours: 0, timedProfit: 0, timed: 0 };
    const p = profitOf(j), h = hoursOf(j);
    b.jobs++; b.revenue += Number(j.revenue ?? 0); b.profit += p;
    if (h) { b.hours += h; b.timedProfit += p; b.timed++; }
    m.set(k, b);
  }
  return [...m.entries()].map(([name, b]) => ({ name, jobs: b.jobs, revenue: r2(b.revenue), profit: r2(b.profit),
    hours: b.timed ? Math.round(b.hours * 10) / 10 : null, perHour: b.timed && b.hours > 0 ? r2(b.timedProfit / b.hours) : null }))
    .sort((a, b) => (a.perHour == null ? 1 : 0) - (b.perHour == null ? 1 : 0) || (b.perHour ?? 0) - (a.perHour ?? 0) || b.profit - a.profit);   // best per hour first, no times last
}

export function moneyPerHour(jobs: HourJob[]) {
  const visits = jobs.filter((j) => serviceOf(j.service));
  const all = bucket(visits, () => "All jobs")[0] ?? null;
  const addons = new Map<string, { count: number; revenue: number; priced: number }>();
  for (const j of visits) for (const a of addonsOn(j)) {
    const x = addons.get(a.name) ?? { count: 0, revenue: 0, priced: 0 };
    x.count++; if (a.amount != null) { x.revenue += a.amount; x.priced++; }
    addons.set(a.name, x);
  }
  return {
    all,
    areas: bucket(visits, (j) => areaOf(j.address)),
    services: bucket(visits, (j) => serviceOf(j.service)),
    addons: [...addons.entries()].map(([name, x]) => ({ name, count: x.count, revenue: r2(x.revenue) })).sort((a, b) => b.count - a.count),
    untimed: visits.filter((j) => !hoursOf(j)).length,
  };
}
