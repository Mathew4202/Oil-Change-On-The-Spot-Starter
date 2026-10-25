// Matching a car someone typed or picked to a car we have on file, when the names differ a little
// ("Chevy" / "Chevrolet", "Mazda6" / "6", "RVR" / "Outlander Sport", "C300" / "C-Class", "Sierra" / "Sierra 1500").
// Pure, so it is tested on its own.

const MAKE_ALIAS: Record<string, string> = { chevy: "chevrolet", mercedes: "mercedesbenz", benz: "mercedesbenz", vw: "volkswagen", ram: "ram", dodgeram: "ram" };
const MODEL_ALIAS: Record<string, string> = { rvr: "outlandersport", qashqai: "roguesport", crv: "crv", cr: "crv", hrv: "hrv" };

const squash = (s: string | null | undefined) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function makeKey(make: string | null | undefined) {
  const k = squash(make);
  return MAKE_ALIAS[k] ?? k;
}

export function modelKey(make: string | null | undefined, model: string | null | undefined) {
  let k = squash(model);
  const mk = makeKey(make);
  if (mk && k.startsWith(mk) && k.length > mk.length) k = k.slice(mk.length);     // "Mazda6" -> "6", "Ram 1500" -> "1500"
  if (mk === "mercedesbenz") k = k.replace(/^([a-z]{1,3})\d{2,3}[a-z0-9]*$/, "$1class").replace(/^([a-z]{1,3})class.*$/, "$1class");   // C300, C 300 4MATIC -> cclass
  return MODEL_ALIAS[k] ?? k;
}

/** 2 = same model, 1 = one name is the other plus a trim or body ("Sierra" / "Sierra 1500", "Corolla" / "Corolla Hatchback"), 0 = different. */
export function modelMatch(make: string, a: string, b: string): 0 | 1 | 2 {
  const x = modelKey(make, a), y = modelKey(make, b);
  if (!x || !y) return 0;
  if (x === y) return 2;
  // a short key like "3" must match whole: "3" is not "300"
  const short = x.length < y.length ? x : y, long = x.length < y.length ? y : x;
  const rest = long.slice(short.length);
  if (/^(cross|sport|coupe|evolution|electric|ev|lightning|prime)/.test(rest)) return 0;   // a different vehicle, not a trim
  if (short.length >= 3 && long.startsWith(short) && !(/\d$/.test(short) && /^\d/.test(rest))) return 1;
  return 0;
}

/** The rows for this car: exact model names first; trim-name matches only if there is no exact one. */
export function sameCar<T extends { make: string; model: string }>(rows: T[], make: string, model: string): T[] {
  const mine = rows.filter((r) => makeKey(r.make) === makeKey(make));
  const exact = mine.filter((r) => modelMatch(make, r.model, model) === 2);
  return exact.length ? exact : mine.filter((r) => modelMatch(make, r.model, model) === 1);
}
