// Read a PDF bank statement with Claude when there's no CSV.
import { cleanStatement, type Parsed } from "@/lib/os/bank";

export const STATEMENT_PROMPT = `This is a monthly bank or credit card statement (Canada, most likely BMO).
List every transaction on it. Skip opening/closing balances, totals and subtotals.
Reply with JSON only:
{"account":"short name, e.g. BMO chequing 1234 or BMO Mastercard 5678 (last 4 digits only)",
 "is_credit_card":true|false,
 "lines":[{"date":"YYYY-MM-DD","amount":-12.34,"description":"text as printed"}]}
For amount: money leaving the account (purchases, withdrawals, fees, bill payments) is NEGATIVE.
Money coming in (deposits, refunds, payments made TO a credit card) is POSITIVE.
If the year isn't printed next to each date, use the statement period's year.`;

export async function readStatementPdf(base64: string): Promise<Parsed> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { account: "", lines: [], error: "PDF reading isn't set up (ANTHROPIC_API_KEY missing). Upload the CSV instead." };
  const res = await fetch(`${process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com"}/v1/messages`, {
    method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", max_tokens: 16000,
      messages: [{ role: "user", content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
        { type: "text", text: STATEMENT_PROMPT },
      ] }],
    }),
  });
  if (!res.ok) return { account: "", lines: [], error: `Couldn't read the PDF (${res.status}). Try the CSV download instead.` };
  const body = await res.json();
  const text = (body.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("\n");
  const a = text.indexOf("{"), z = text.lastIndexOf("}");
  try { return cleanStatement(JSON.parse(text.slice(a, z + 1))); }
  catch { return { account: "", lines: [], error: "Couldn't read the PDF. Try the CSV download instead." }; }
}
