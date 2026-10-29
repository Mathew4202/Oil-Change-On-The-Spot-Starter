// Who can see and do what in HQ. Owners (Mathew, Harsh) see everything. Staff logins get only their part:
// the tabs they don't have are gone from the menu (not greyed out), and the server refuses those pages and actions too.
// Pure (no Next.js imports), so the middleware and the tests can both use it.

export type Role = "owner" | "manager" | "front_desk" | "technician" | "accountant" | "fleet_sales" | "marketing" | "trainee";
export const ROLES: Role[] = ["owner", "manager", "front_desk", "technician", "accountant", "fleet_sales", "marketing", "trainee"];

export type Tab = "calendar" | "customers" | "receipt" | "stock" | "money";

export type Can = {
  tabs: Tab[];
  money: boolean;      // profit, costs, day totals, Money tab, bank
  jobs: boolean;       // start and finish jobs, take payment, receipts
  book: boolean;       // new bookings, move or cancel, hold a time for a caller
  calls: boolean;      // calls and texts panel, reply to texts
  fleets: boolean;     // fleet accounts: vehicles, book yard visits, send their link
  invoices: boolean;   // fleet invoices: make, send, mark paid
  timeOff: boolean;    // block time on the calendar
  team: boolean;       // make logins for staff
  settings: boolean;   // engine list, oil approval lookups, AI spend
};

export const ROLE_INFO: Record<Role, { name: string; blurb: string; can: Can }> = {
  owner: { name: "Owner", blurb: "Everything.",
    can: { tabs: ["calendar", "customers", "receipt", "stock", "money"], money: true, jobs: true, book: true, calls: true, fleets: true, invoices: true, timeOff: true, team: true, settings: true } },
  manager: { name: "Manager", blurb: "Runs the day: calendar, customers, fleets, jobs, stock and parts receipts. No money, profit or logins.",
    can: { tabs: ["calendar", "customers", "receipt", "stock"], money: false, jobs: true, book: true, calls: true, fleets: true, invoices: false, timeOff: true, team: false, settings: false } },
  front_desk: { name: "Front desk", blurb: "Answers calls and texts, books and confirms appointments, moves or cancels them, keeps customer and fleet details up to date. No jobs, money or stock.",
    can: { tabs: ["calendar", "customers"], money: false, jobs: false, book: true, calls: true, fleets: true, invoices: false, timeOff: false, team: false, settings: false } },
  accountant: { name: "Accountant / bookkeeper", blurb: "Money, HST, bank statements, receipts and fleet invoices. Sees the calendar but can't book, move or do jobs. No customer list or logins.",
    can: { tabs: ["calendar", "receipt", "money"], money: true, jobs: false, book: false, calls: false, fleets: true, invoices: true, timeOff: false, team: false, settings: false } },
  fleet_sales: { name: "Sales and fleets", blurb: "Wins and looks after business accounts: fleets, their vehicles and yard visits, customers, calls and texts, bookings. No money, profit, invoices or jobs.",
    can: { tabs: ["calendar", "customers"], money: false, jobs: false, book: true, calls: true, fleets: true, invoices: false, timeOff: false, team: false, settings: false } },
  marketing: { name: "Marketing", blurb: "Customer list and plans for promos and follow-ups, and the calendar to see how busy we are. Can't book, move or change jobs. No money.",
    can: { tabs: ["calendar", "customers"], money: false, jobs: false, book: false, calls: false, fleets: false, invoices: false, timeOff: false, team: false, settings: false } },
  trainee: { name: "Trainee", blurb: "Learning the ropes: sees the day's jobs with the oil and parts, and the stock. Can't start or finish jobs, take payment or book.",
    can: { tabs: ["calendar", "stock"], money: false, jobs: false, book: false, calls: false, fleets: false, invoices: false, timeOff: false, team: false, settings: false } },
  technician: { name: "Technician", blurb: "Does the jobs: sees the day's jobs with the oil and parts, starts and finishes them, takes payment, logs parts receipts and stock. No booking, customer list or money.",
    can: { tabs: ["calendar", "receipt", "stock"], money: false, jobs: true, book: false, calls: false, fleets: false, invoices: false, timeOff: false, team: false, settings: false } },
};

export const canOf = (role: string | null | undefined): Can => ROLE_INFO[(ROLES as string[]).includes(role || "") ? (role as Role) : "technician"].can;
export const isRole = (r: unknown): r is Role => typeof r === "string" && (ROLES as string[]).includes(r);

type Need = keyof Omit<Can, "tabs"> | Tab | "any";
// most specific first
const PAGES: [RegExp, Need][] = [
  [/^\/owner\/team/, "team"],
  [/^\/owner\/money/, "money"],
  [/^\/owner\/customers/, "customers"],
  [/^\/owner\/plans/, "customers"],
  [/^\/owner\/fleets/, "fleets"],
  [/^\/owner\/receipt/, "receipt"],
  [/^\/owner\/stock/, "stock"],
  [/^\/owner\/?$/, "any"],
];
const APIS: [RegExp, Need][] = [
  [/^\/api\/owner\/(alerts|push|day|me|logout|login)/, "any"],
  [/^\/api\/owner\/(book|hold|manage)/, "book"],
  [/^\/api\/owner\/calls/, "calls"],
  [/^\/api\/owner\/(customers|plans)/, "customers"],
  [/^\/api\/owner\/job/, "jobs"],
  [/^\/api\/owner\/read-photo/, "any"],      // VIN / odometer / fleet list photos: used by jobs and fleets
  [/^\/api\/owner\/oil-lookup/, "any"],      // "look up the oil now" on a job card
  [/^\/api\/owner\/receipt/, "receipt"],
  [/^\/api\/owner\/stock/, "stock"],
  [/^\/api\/owner\/fleet/, "fleets"],
  [/^\/api\/owner\/time-off/, "timeOff"],
  [/^\/api\/owner\/team/, "team"],
  [/^\/api\/owner\/(specs|ai-check|engines-import)/, "settings"],
  [/^\/api\/owner\/(money|bank)/, "money"],
];

function has(c: Can, need: Need) {
  if (need === "any") return true;
  if ((["calendar", "customers", "receipt", "stock"] as string[]).includes(need)) return c.tabs.includes(need as Tab);
  return !!c[need as keyof Omit<Can, "tabs">];
}

/** May this role open this HQ page or call this HQ API? Anything not listed is owners only. */
export function allowed(role: string | null | undefined, path: string): boolean {
  const c = canOf(role);
  if (role === "owner") return true;
  const list = path.startsWith("/api/") ? APIS : PAGES;
  const hit = list.find(([re]) => re.test(path));
  return hit ? has(c, hit[1]) : false;
}

/** A login name: lower case letters, numbers, - and _ (it goes inside the signed cookie). */
export const cleanUsername = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9_-]/g, "").slice(0, 30);
