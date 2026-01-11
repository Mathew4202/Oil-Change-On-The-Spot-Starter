// app/fleet-request/page.tsx
import { Suspense } from "react";
import FleetRequestClient from "./FleetRequestClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function FleetRequestPage() {
  return (
    <Suspense fallback={<div className="container py-12">Loading...</div>}>
      <FleetRequestClient />
    </Suspense>
  );
}
