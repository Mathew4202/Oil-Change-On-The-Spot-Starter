import { Suspense } from "react";
import MembershipRequestClient from "./MembershipRequestClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Membership Request",
  description: "Request a maintenance membership. Mobile service in HRM.",
};

export default function MembershipRequestPage() {
  return (
    <Suspense fallback={<div className="container py-12">Loading…</div>}>
      <MembershipRequestClient />
    </Suspense>
  );
}
