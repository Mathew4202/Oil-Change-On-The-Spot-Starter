// Customer's receipt page (private link from the email / text).
import { receiptFor } from "@/lib/os/jobs";
import { receiptHtml } from "@/lib/os/receipt";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const t = (params.token || "").replace(/[^A-Za-z0-9_-]/g, "");
  const r = t.length >= 20 ? await receiptFor(`receipt_token=eq.${t}`) : null;
  if (!r) return new Response("Receipt not found", { status: 404, headers: { "content-type": "text/plain" } });
  return new Response(receiptHtml({ ...r.data, receiptUrl: null }), {
    headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex", "cache-control": "private, no-store" },
  });
}
