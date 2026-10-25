// Read a PDF bank statement with the free AI (see ai.ts) when there's no CSV.
import { askAI } from "@/lib/os/ai";
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
  const r = await askAI({ prompt: STATEMENT_PROMPT, file: { mime: "application/pdf", base64 }, maxTokens: 16000, big: true });
  if (!r) return { account: "", lines: [], error: "PDF reading isn't available right now. Upload the CSV instead." };
  const text = r.text;
  const a = text.indexOf("{"), z = text.lastIndexOf("}");
  try { return cleanStatement(JSON.parse(text.slice(a, z + 1))); }
  catch { return { account: "", lines: [], error: "Couldn't read the PDF. Try the CSV download instead." }; }
}
