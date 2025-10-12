import { NextResponse } from 'next/server';

// ical is CommonJS
const ical = require('ical');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // never cache by Next.js

function isSameYMD(a: Date, y: number, m: number, d: number) {
  return a.getFullYear() === y && a.getMonth() === m && a.getDate() === d;
}

export async function GET(req: Request) {
  try {
    const url = process.env.APPT_ICS_URL;
    if (!url) throw new Error("APPT_ICS_URL not set in .env.local");

    const u = new URL(req.url);
    const dateStr = u.searchParams.get('date'); // YYYY-MM-DD
    const haveDate = Boolean(dateStr);

    const res = await fetch(url, { cache: 'no-store' }); // do not cache here
    const text = await res.text();
    const events = ical.parseICS(text);

    let busy = Object.values(events)
      .filter((e: any) => e && e.type === 'VEVENT' && e.start && e.end)
      .map((e: any) => ({
        start: new Date(e.start),
        end: new Date(e.end),
        summary: String(e.summary || ''),
      }));

    if (haveDate) {
      const [Y, M, D] = dateStr!.split('-').map(Number);
      busy = busy.filter(({ start, end }) =>
        isSameYMD(start, Y, M - 1, D) || isSameYMD(end, Y, M - 1, D)
      );
    }

    return NextResponse.json({
      busy: busy.map(b => ({
        start: b.start.toISOString(),
        end: b.end.toISOString(),
        summary: b.summary,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

