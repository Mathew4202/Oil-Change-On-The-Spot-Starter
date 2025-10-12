// app/request/page.tsx  (SERVER COMPONENT)
import { Suspense } from 'react';
import RequestPageClient from './RequestPageClient';

export const dynamic = 'force-dynamic';   // avoids strict prerendering issues
export const revalidate = 0;              // no caching

export default function RequestPage() {
  return (
    <Suspense fallback={<div className="container py-12">Loading…</div>}>
      <RequestPageClient />
    </Suspense>
  );
}
