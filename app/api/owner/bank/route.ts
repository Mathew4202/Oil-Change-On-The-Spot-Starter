// GET → lines that need a look + past uploads
// POST {file: dataURL, name} → read a CSV or PDF statement, save and match it
// PATCH {id, action: expense|personal|ok|undo, category?} → owner sorts a line
import { NextRequest, NextResponse } from "next/server";
import { currentOwner } from "@/lib/os/auth";
import { sbGet } from "@/lib/os/db";
import { parseBankCsv } from "@/lib/os/bank";
import { readStatementPdf } from "@/lib/os/bank-pdf";
import { importStatement, decideLine } from "@/lib/os/bank-import";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  if (!currentOwner()) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const [needs, imports, recent] = await Promise.all([
    sbGet("bank_lines?select=id,account,posted_on,amount,description,kind,category,note&status=eq.needs_look&order=posted_on.desc&limit=200"),
    sbGet<{ id: string; file_name: string; account: string; from_date: string; to_date: string; lines: number; added_by: string; created_at: string }>(
      "bank_imports?select=id,file_name,account,from_date,to_date,lines,added_by,created_at&order=created_at.desc&limit=12"),
    sbGet("bank_lines?select=id,posted_on,amount,description,status,kind,category,note,decided_by&status=neq.needs_look&order=posted_on.desc&limit=60"),
  ]);
  return NextResponse.json({ needsLook: needs, imports, recent });
}

export async function POST(req: NextRequest) {
  const owner = currentOwner();
  if (!owner) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "statement");
  const m = String(body.file || "").match(/^data:([^;,]*)(?:;[^,]*)?;base64,(.+)$/);
  if (!m) return NextResponse.json({ error: "Pick a CSV or PDF statement" }, { status: 400 });
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length > 4_000_000) return NextResponse.json({ error: "That file is too big (4 MB max)" }, { status: 400 });
  const isPdf = m[1] === "application/pdf" || /\.pdf$/i.test(name) || bytes.subarray(0, 4).toString() === "%PDF";
  const parsed = isPdf ? await readStatementPdf(m[2]) : parseBankCsv(bytes.toString("utf8"), name);
  if (parsed.error || !parsed.lines.length) return NextResponse.json({ error: parsed.error || "No transactions found" }, { status: 422 });
  const r = await importStatement(parsed, name, owner);
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}

export async function PATCH(req: NextRequest) {
  const owner = currentOwner();
  if (!owner) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (!b.id || !["expense", "personal", "ok", "undo"].includes(b.action)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const r = await decideLine(String(b.id), b.action, typeof b.category === "string" ? b.category.slice(0, 30) : null, owner);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
