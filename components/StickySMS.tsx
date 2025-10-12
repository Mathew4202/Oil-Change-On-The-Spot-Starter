'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { track } from '@/lib/analytics';

export default function StickySMS() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const disabled = pathname?.startsWith('/request') ?? false;
    const onScroll = () => {
      const nearFooter = window.innerHeight + window.scrollY >= document.body.scrollHeight - 160;
      setShow(!disabled && window.scrollY > 300 && !nearFooter);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [pathname]);

  if (!show) return null;

  return (
    <div className="fixed right-4 bottom-24 z-40 flex gap-2">
      {/* SMS */}
      <a
        href="sms:+19024120344" // your number
        onClick={() => track('cta_sms_click')}
        className="inline-flex items-center gap-2 rounded-full bg-yellow-500 px-4 py-2 text-blue-900 font-semibold shadow-lg hover:bg-yellow-600 active:scale-[0.98] transition"
      >
        Text us
      </a>

      {/* WhatsApp (remove if you don’t use WhatsApp) */}
      <a
        href="https://wa.me/17826408341?text=Hi%20I%27d%20like%20an%20oil%20change%20quote"
        target="_blank"
        onClick={() => track('cta_whatsapp_click')}
        className="inline-flex items-center gap-2 rounded-full bg-green-500 px-4 py-2 text-white font-semibold shadow-lg hover:bg-green-600 active:scale-[0.98] transition"
      >
        WhatsApp
      </a>
    </div>
  );
}