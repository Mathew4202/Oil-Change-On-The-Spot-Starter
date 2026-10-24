import { redirect } from "next/navigation";
import { currentOwner } from "@/lib/os/auth";
import Calendar from "./Calendar";

export const dynamic = "force-dynamic";

export default function OwnerHome() {
  const owner = currentOwner();
  if (!owner) redirect("/owner/login");
  return <Calendar owner={owner} />;
}
