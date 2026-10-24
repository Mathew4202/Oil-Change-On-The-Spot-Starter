-- Pay online (Elavon Converge hosted payment page).
-- One row per payment attempt. The card details never touch our server: Converge's own page takes them,
-- then sends the customer back and we check the result with Converge directly before recording anything.

create table if not exists online_payments (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid references bookings(id),
  job_id        uuid references jobs(id),
  kind          text not null check (kind in ('prepay','job')),   -- prepay = paid when booking, job = paid after (incl. cancellation fee)
  amount        numeric(10,2) not null,                            -- what we asked Converge to charge, tip included
  tip           numeric(10,2) not null default 0,
  status        text not null default 'started' check (status in ('started','approved','declined','error')),
  txn_id        text,
  card_last4    text,
  message       text,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);
create unique index if not exists online_payments_txn_once on online_payments (txn_id) where txn_id is not null;
create index if not exists online_payments_booking on online_payments (booking_id);

alter table online_payments enable row level security;

-- Text with a pay link, sent from the job screen when they'd rather pay online after the job
insert into message_templates (key, body) values
  ('pay_request', E'Hi {first_name}, thanks for having us! Your total is {total}. You can pay here: {pay_link}\nQuestions? Call or text {phone}.\n- Mathew, Oil Change On The Spot')
on conflict (key) do nothing;

-- The booking text no longer always says "paid after the job"
update message_templates set body = replace(body, 'with HST, paid after the job.', 'with HST{pay_note}.')
where key = 'booking_confirmation' and body like '%with HST, paid after the job.%';
