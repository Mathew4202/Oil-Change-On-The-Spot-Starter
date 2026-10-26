import { redirect } from "next/navigation";
import { currentStaff } from "@/lib/os/auth";
import TeamScreen from "./TeamScreen";
export const dynamic = "force-dynamic";
export default function Page() {
  const s = currentStaff();
  if (!s) redirect("/owner/login");
  if (s.role !== "owner") redirect("/owner");
  return <TeamScreen />;
}
