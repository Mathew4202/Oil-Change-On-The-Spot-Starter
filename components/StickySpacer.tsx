'use client';
import { usePathname } from 'next/navigation';

export default function StickySpacer() {
  const pathname = usePathname();
  // Don’t add space on the request page (we hide sticky bars there)
  if (pathname?.startsWith('/request')) return null;

  // ~80px space only on mobile
  return <div className="h-20 md:hidden" />;
}
