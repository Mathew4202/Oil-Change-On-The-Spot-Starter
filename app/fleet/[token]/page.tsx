// A fleet's own page (private link, no password): vehicles, what's due, visits, history, invoices, and booking.
import FleetPortal from "./FleetPortal";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your fleet", robots: { index: false, follow: false } };

export default function Page({ params }: { params: { token: string } }) {
  return <FleetPortal token={params.token} />;
}
