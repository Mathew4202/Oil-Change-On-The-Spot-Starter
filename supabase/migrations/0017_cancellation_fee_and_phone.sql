-- OCOTS OS: same-day cancellation fee, business phone in texts, maintenance plan requests. Safe to run again.
begin;
-- Texts use {phone} so the number changes in one place (Vercel setting) when Quo is set up
update message_templates set body = replace(body, '782-640-8341', '{phone}') where body like '%782-640-8341%';

-- Same-day cancellation: $30 fee (owners can waive it for emergencies or bad weather)
insert into pricing_rules (key, value, note) values ('same_day_cancel_fee', 30, 'same-day cancellation fee before HST')
on conflict (key) do nothing;
alter table bookings add column if not exists cancel_fee numeric(10,2);          -- charged, before HST
alter table bookings add column if not exists cancel_fee_waived boolean;

-- Maintenance plan requests from the website
create table if not exists plan_requests (
  id           uuid primary key default gen_random_uuid(),
  customer_name text not null,
  phone        text not null,
  email        text,
  car          text not null,
  visits       int not null,
  swaps        int not null default 0,
  monthly      numeric(10,2) not null,      -- before HST
  breakdown    jsonb,
  status       text not null default 'new' check (status in ('new','offered','signed','declined')),
  created_at   timestamptz not null default now()
);
alter table plan_requests enable row level security;
commit;
select key, body from message_templates where body like '%{phone}%';

-- (added) text for the same-day fee, and when the customer agreed to the terms
begin;
alter table bookings add column if not exists terms_accepted_at timestamptz;
insert into message_templates (key, body, active) values ('cancel_fee',
'Hi {first_name}, as your booking was cancelled on the day, our same-day cancellation fee of {fee} + HST ({total}) applies. You can pay it here: {pay_link}
Questions? Call or text {phone}.
- Mathew, Oil Change On The Spot', true)
on conflict (key) do nothing;
commit;
