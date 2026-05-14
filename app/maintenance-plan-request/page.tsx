import { Suspense } from "react";
import MaintenancePlanRequestClient from "./MaintenancePlanRequestClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function MaintenancePlanRequestPage() {
  return (
    <Suspense fallback={<div className="container py-12">Loading…</div>}>
      <MaintenancePlanRequestClient />
    </Suspense>
  );
}