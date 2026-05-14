import { Suspense } from "react";
import CustomPlanRequestClient from "./CustomPlanRequestClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function CustomPlanRequestPage() {
  return (
    <Suspense fallback={<div className="container py-12">Loading…</div>}>
      <CustomPlanRequestClient />
    </Suspense>
  );
}