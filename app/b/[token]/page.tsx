import Manage from "./Manage";
export const metadata = { title: "Your booking", robots: { index: false, follow: false } };
export default function ManagePage({ params }: { params: { token: string } }) {
  return <Manage token={params.token} />;
}
