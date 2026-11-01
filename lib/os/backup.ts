// Weekly backup by email (free): the free Supabase plan keeps no backups you can restore yourself, so every Sunday
// evening HQ emails the business inbox a copy of everything. One .json.gz file has every table (to restore from),
// and jobs, expenses and customers come as .csv files that open in Google Sheets or Excel.
// Login passwords and secret keys are never included.
import { gzipSync } from "zlib";
import { Resend } from "resend";
import { sbGet } from "@/lib/os/db";
import { emailFrom } from "@/lib/os/email-from";

// everything worth keeping (logs that refill themselves, caches and one-time codes are left out)
const TABLES = ["customers", "vehicles", "vehicle_specs", "bookings", "jobs", "job_items", "expenses", "payments", "online_payments",
  "fleet_accounts", "fleet_requests", "invoices", "plans", "plan_requests", "plan_bills", "customer_credits", "parts", "part_quotes",
  "oil_prices", "stock_moves", "pricing_rules", "message_templates", "business_hours", "time_off", "seasonal_windows", "services",
  "car_engines", "calls", "messages", "bank_imports", "bank_lines", "route_offers", "slot_holds"];
const SECRET_COLS = /password|hash|secret|token_hash|code_hash/i;

async function all(table: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let off = 0; off < 200_000; off += 1000) {
    const rows = await sbGet<Record<string, unknown>>(`${table}?select=*&limit=1000&offset=${off}`);
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

function csv(rows: Record<string, unknown>[], cols: string[]) {
  const cell = (v: unknown) => {
    const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
}

export async function backupNow(to?: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: "email isn't set up (RESEND_API_KEY)" };
  const data: Record<string, Record<string, unknown>[]> = {};
  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    try {
      const rows = (await all(t)).map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !SECRET_COLS.test(k))));
      data[t] = rows; counts[t] = rows.length;
    } catch { /* table not there yet: skip */ }
  }
  // staff: names and roles only
  try { data.staff = await sbGet("staff?select=username,display_name,role,active,phone,created_at"); } catch { /* migration 0032 not run */ }
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/Halifax" });
  const custName = new Map((data.customers ?? []).map((c) => [c.id, [c.first_name, c.last_name].filter(Boolean).join(" ")]));
  const jobs = (data.jobs ?? []).map((j) => ({ ...j, customer: custName.get(j.customer_id) ?? "" }));
  const attachments = [
    { filename: `ocots-backup-${day}.json.gz`, content: gzipSync(Buffer.from(JSON.stringify({ made: new Date().toISOString(), tables: data }))) },
    { filename: `jobs-${day}.csv`, content: Buffer.from(csv(jobs, ["done_at", "customer", "vehicle_text", "service", "revenue", "hst", "tip", "total", "payment_method", "cost_oil", "cost_parts", "cost_other", "done_by", "receipt_no", "notes"])) },
    { filename: `expenses-${day}.csv`, content: Buffer.from(csv(data.expenses ?? [], ["spent_at", "description", "category", "total", "hst", "subtotal", "source"])) },
    { filename: `customers-${day}.csv`, content: Buffer.from(csv(data.customers ?? [], ["first_name", "last_name", "phone", "email", "address", "created_at", "source"])) },
  ];
  const size = attachments.reduce((t, a) => t + a.content.length, 0);
  const files = attachments.map((a) => ({ filename: a.filename, content: a.content.toString("base64") }));   // base64: what Resend's API takes
  const lines = Object.entries(counts).filter(([, n]) => n > 0).map(([t, n]) => `${t}: ${n}`).join("\n");
  try {
    await new Resend(key).emails.send({
      from: emailFrom(), to: to || process.env.BACKUP_EMAIL || process.env.NOTIFY_TO || "oilchangeonthespot@gmail.com",
      subject: `OCOTS HQ backup ${day}`,
      text: `This week's copy of everything in HQ is attached. Keep these emails: if anything in HQ is ever lost or deleted by mistake, the .json.gz file has it all back.\n\nThe .csv files open in Google Sheets or Excel.\n\nWhat's in it:\n${lines}\n`,
      attachments: files,
    });
  } catch (e) { return { sent: false, reason: String(e).slice(0, 160) }; }
  return { sent: true, tables: Object.keys(data).length, rows: Object.values(counts).reduce((a, b) => a + b, 0), kb: Math.round(size / 1024) };
}
