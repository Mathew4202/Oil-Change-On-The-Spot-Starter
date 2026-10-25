// Read a PDF bank or credit card statement on our own server: the PDF's text and positions, then plain rules.
// No AI and nothing leaves the app, so banking details stay private and it costs nothing.
import { getDocumentProxy } from "unpdf";
import { cleanStatement, type Parsed } from "@/lib/os/bank";
import { parseStatement, type Row } from "@/lib/os/statement-pdf";

export async function readStatementPdf(base64: string): Promise<Parsed> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(Buffer.from(base64, "base64")));
    const rows: Row[] = [];
    let full = "";
    for (let p = 1; p <= Math.min(pdf.numPages, 30); p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const byY = new Map<number, Row>();
      for (const it of tc.items as { str?: string; transform?: number[] }[]) {
        if (!it.str || !it.transform) continue;
        full += `${it.str} `;
        const y = Math.round(it.transform[5] / 3) * 3;   // same line within a few points
        const r = byY.get(y) ?? { page: p, y, items: [] };
        r.items.push({ x: it.transform[4], str: it.str });
        byY.set(y, r);
      }
      rows.push(...[...byY.values()].sort((a, b) => b.y - a.y));   // top of the page first
      full += "\n";
    }
    if (full.replace(/\s/g, "").length < 50) return { account: "", lines: [], error: "This PDF is a scanned picture with no text in it. Download the statement PDF or CSV from online banking instead." };
    const r = parseStatement(rows, full);
    if (r.error) return { account: r.account, lines: [], error: r.error };
    return cleanStatement({ account: r.account || "Bank statement", is_credit_card: r.isCreditCard, lines: r.lines });
  } catch (e) {
    console.error("statement pdf", e);
    return { account: "", lines: [], error: "Couldn't open this PDF. Download the CSV from online banking instead." };
  }
}
