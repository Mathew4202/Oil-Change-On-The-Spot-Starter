import { redirect } from "next/navigation";
import { currentOwner } from "@/lib/os/auth";
import FleetAccount from "./FleetAccount";
export const dynamic = "force-dynamic";
export default function Page({ params }: { params: { id: string } }) {
  const owner = currentOwner();
  if (!owner) redirect("/owner/login");
  return <FleetAccount id={params.id} />;
}
