import { redirect } from "next/navigation";
import { currentOwner } from "@/lib/os/auth";
import ReceiptScreen from "./ReceiptScreen";
export const dynamic = "force-dynamic";
export default function Page() {
  const owner = currentOwner();
  if (!owner) redirect("/owner/login");
  return <ReceiptScreen owner={owner} />;
}
