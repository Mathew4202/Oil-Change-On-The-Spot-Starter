// Where the money is: profit per hour by area, by service, and what the add-ons bring in.
// Hours = time booked at the stop plus the real day's driving: home to the first job, job to job, and back home after
// the last one. Each drive counts toward the job it goes to (the drive home counts toward the last job of the day).
// Drives that leave between 3 and 6 pm go slower (rush hour). Distances are straight-line x 1.3.
// Pure (no database), so it is tested on its own. Old imported jobs have no booked time: they count toward
// totals but not toward the per-hour figure.

export type HourJob = {
  revenue: number | null; cost_oil: number | null; cost_parts: number | null; cost_other: number | null;
  service: string | null; lines: { label: string; amount: number }[] | null;
  address: string | null; minutes: number | null; driveMin: number | null;
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

type P = { lat: number; lng: number };
const kmRoad = (a: P, b: P) => {
  const R = 6371, rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h)) * 1.3;
};
export const SPEED = 40, RUSH_SPEED = 25;   // km/h around HRM, and from 3 to 6 pm
const driveMins = (km: number, leaveAt: number) => (km / (leaveAt >= 900 && leaveAt < 1080 ? RUSH_SPEED : SPEED)) * 60;

/**
 * One day's stops (clock minutes after midnight) → drive minutes for each stop: the drive to it, plus the drive home
 * for the last one. A stop with no map point is skipped over (the drive goes from the one before to the one after).
 */
export function dayDrives(stops: { id: string; pt: P | null; start: number; end: number }[], home: P) {
  const out = new Map<string, number>();
  const s = stops.filter((x) => x.pt).sort((a, b) => a.start - b.start);
  let at: P = home, free = s.length ? s[0].start - 30 : 0;
  for (const x of s) {
    const km = kmRoad(at, x.pt!);
    out.set(x.id, (out.get(x.id) ?? 0) + driveMins(km, Math.max(free, x.start - (km / SPEED) * 60)));
    at = x.pt!; free = x.end;
  }
  if (s.length) { const last = s[s.length - 1]; out.set(last.id, (out.get(last.id) ?? 0) + driveMins(kmRoad(at, home), last.end)); }
  return out;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const profitOf = (j: HourJob) => Number(j.revenue ?? 0) - Number(j.cost_oil ?? 0) - Number(j.cost_parts ?? 0) - Number(j.cost_other ?? 0);
const hoursOf = (j: HourJob) => (j.minutes && j.minutes > 0 ? (j.minutes + (j.driveMin ?? 0)) / 60 : null);

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
