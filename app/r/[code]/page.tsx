// A friend's referral link: /r/CODE → the booking page, with the code kept so the friend who sent them gets $5 off.
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default function RefLink({ params }: { params: { code: string } }) {
  const code = String(params.code || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20);
  redirect(code ? `/booking?ref=${code}` : "/booking");
}
