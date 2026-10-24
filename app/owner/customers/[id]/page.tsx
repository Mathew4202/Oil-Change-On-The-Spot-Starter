import { redirect } from "next/navigation";
import { currentOwner } from "@/lib/os/auth";
import CustomerScreen from "./CustomerScreen";
export const dynamic = "force-dynamic";
export default function Page({ params }: { params: { id: string } }) {
  if (!currentOwner()) redirect("/owner/login");
  return <CustomerScreen id={params.id} />;
}
