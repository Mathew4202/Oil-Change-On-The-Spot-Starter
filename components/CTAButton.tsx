'use client';
import Link from 'next/link';
import type { Route } from 'next';

type Variant = 'primary' | 'secondary' | 'sms';

interface CTAButtonProps {
  href: string;           // '/request', 'https://…', 'sms:+1…', 'tel:+1…', 'mailto:…'
  label: string;
  variant?: Variant;
  newTab?: boolean;       // for external links
}

export default function CTAButton({ href, label, variant = 'primary', newTab }: CTAButtonProps) {
  const base = 'inline-flex items-center justify-center rounded-lg px-5 py-3 font-semibold transition shadow-md';
  const styles =
    variant === 'primary'
      ? 'bg-blue-700 text-white hover:bg-blue-800'
      : variant === 'secondary'
      ? 'border border-blue-600 text-blue-700 hover:bg-blue-50'
      : 'bg-yellow-400 text-blue-900 hover:bg-yellow-500';

  // Internal route if it starts with a single slash
  const isInternal = href.startsWith('/') && !href.startsWith('//');

  if (isInternal) {
    // 👇 Cast to Route to satisfy typedRoutes
    return (
      <Link href={href as Route} className={`${base} ${styles}`}>
        {label}
      </Link>
    );
  }

  // External/protocol links
  return (
    <a
      href={href}
      target={newTab ? '_blank' : undefined}
      rel={newTab ? 'noopener noreferrer' : undefined}
      className={`${base} ${styles}`}
    >
      {label}
    </a>
  );
}

