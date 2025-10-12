import { NextResponse } from 'next/server';
import crypto from 'crypto';

const SQUARE_BASE = 'https://connect.squareup.com';

function isoFromLocal(date: string, time: string) {
  // Interpret the submitted date + time as local time and convert to ISO UTC.
  // Works fine for “good enough” scheduling; you can swap to a TZ library later.
  const d = new Date(`${date}T${time}:00`);
  return d.toISOString();
}

export async function POST(req: Request) {
  const body = await req.json();

  const token = process.env.SQUARE_ACCESS_TOKEN;
  const locationId = process.env.SQUARE_LOCATION_ID;
  const teamMemberId = process.env.SQUARE_TEAM_MEMBER_ID;
  const serviceVariationId = process.env.SQUARE_SERVICE_VARIATION_ID;

  if (!token || !locationId || !teamMemberId || !serviceVariationId) {
    return NextResponse.json({ error: 'Missing Square env vars' }, { status: 500 });
  }

  const {
    name, phone, email,
    year, make, model,
    price, address,
    preferred_date, preferred_time,
    notes,
  } = body || {};

  // 1) Find or create customer
  let customerId: string | undefined;
  try {
    if (email) {
      const search = await fetch(`${SQUARE_BASE}/v2/customers/search`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: { filter: { email_address: { exact: email } } },
          limit: 1,
        }),
      });
      const s = await search.json();
      customerId = s?.customers?.[0]?.id;
    }
  } catch {}

  if (!customerId) {
    const create = await fetch(`${SQUARE_BASE}/v2/customers`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        given_name: name || '',
        email_address: email || undefined,
        phone_number: phone || undefined,
        address: address ? { address_line_1: address } : undefined,
        note: `Quote Pending - ${year || ''} ${make || ''} ${model || ''} - $${price || ''}`,
      }),
    });
    const c = await create.json();
    customerId = c?.customer?.id;
  }

  if (!customerId) {
    return NextResponse.json({ error: 'Could not create customer' }, { status: 500 });
  }

  // 2) Build booking payload
  const startAt = isoFromLocal(preferred_date, preferred_time); // RFC3339
  const idempotencyKey = crypto.randomUUID();

  const bookingPayload = {
    idempotency_key: idempotencyKey,
    booking: {
      location_id: locationId,
      start_at: startAt,
      customer_id: customerId,
      customer_note: `Quote Pending - ${year} ${make} ${model} - $${price}. Address: ${address}. ${notes || ''}`.slice(0, 1000),
      seller_note: `Quote Pending from website.`,
      appointment_segments: [
        {
          team_member_id: teamMemberId,
          service_variation_id: serviceVariationId,
          // Square will use the duration from the service variation.
        },
      ],
    },
  };

  // 3) Create booking
  const createBooking = await fetch(`${SQUARE_BASE}/v2/bookings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Square-Version': '2024-06-20', // any recent version is fine
    },
    body: JSON.stringify(bookingPayload),
  });

  const bookingRes = await createBooking.json();

  if (!createBooking.ok) {
    // bubble up Square error for debugging
    return NextResponse.json(
      { error: bookingRes?.errors?.[0]?.detail || 'Square booking failed', raw: bookingRes },
      { status: 500 }
    );
  }

  // 4) Optionally add a custom tag on the booking (if you use them in your workflow)
  // Skipped here for simplicity.

  return NextResponse.json({ ok: true, booking: bookingRes?.booking });
}
