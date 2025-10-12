'use client'
import { usePathname } from 'next/navigation';

export default function Body({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  // put the current route on the body so we can style per-page
  return <body data-path={path}>{children}</body>;
}
