import { redirect } from "next/navigation";
import { currentOwner } from "@/lib/os/auth";
import Calendar from "./Calendar";

export const dynamic = "force-dynamic";

export default function OwnerHome({ searchParams }: { searchParams: { date?: string; book?: string } }) {
  const owner = currentOwner();
  if (!owner) redirect("/owner/login");
  const d = searchParams?.date;
  return <Calendar owner={owner} initialDate={d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined}
    bookFor={searchParams?.book && /^[0-9a-f-]{36}$/i.test(searchParams.book) ? searchParams.book : undefined} />;
}
