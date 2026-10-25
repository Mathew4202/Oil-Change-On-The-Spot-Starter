import { redirect } from "next/navigation";
import { currentOwner } from "@/lib/os/auth";
import FleetsScreen from "./FleetsScreen";
export const dynamic = "force-dynamic";
export default function Page() {
  if (!currentOwner()) redirect("/owner/login");
  return <FleetsScreen />;
}
