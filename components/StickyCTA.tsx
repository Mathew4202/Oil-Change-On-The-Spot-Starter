'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import CTAButton from '@/components/CTAButton';

export default function StickyCTA() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const disabledOnThisPage = pathname?.startsWith('/request') ?? false;
    const onScroll = () => {
      const nearFooter =
        window.innerHeight + window.scrollY >= document.body.scrollHeight - 160;
      setShow(!disabledOnThisPage && window.scrollY > 300 && !nearFooter);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [pathname]);

  if (!show) return null;

  return (
    // ⬇️ float bottom-right on mobile, under the SMS chip
    // fixed bottom-right, below the SMS chip
<div className="fixed right-3 bottom-4 z-40 md:hidden">
  <CTAButton href="/request" label="Request a Quote" />
</div>

  );
}

