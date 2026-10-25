-- Maintenance plan members: terms by text, I AGREE turns it on, a pay link every month, visits covered when they book.
create table if not exists plans (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid references customers(id),
  vehicle_id      uuid references vehicles(id),
  request_id      uuid references plan_requests(id),
  name            text,
  phone           text not null,
  car             text,
  status          text not null default 'offered' check (status in ('offered','active','ended','cancelled')),
  visits_per_year int not null,
  swaps_per_year  int not null default 0,
  per_visit       numeric(10,2) not null,   -- before HST
  swap_price      numeric(10,2) not null default 0,
  monthly         numeric(10,2) not null,   -- before HST
  hst_rate        numeric(5,4) not null default 0.14,
  offered_at      timestamptz,
  agreed_at       timestamptz,
  starts_on       date,
  ends_on         date,
  bill_day        int,                       -- day of the month the pay link goes out (1 to 28)
  notes           text,
  created_by      text,
  created_at      timestamptz not null default now()
);
create index if not exists plans_phone on plans (phone);
alter table plans enable row level security;

create table if not exists plan_bills (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references plans(id),
  period     date not null,                  -- first day of the month it's for
  subtotal   numeric(10,2) not null,
  hst        numeric(10,2) not null,
  total      numeric(10,2) not null,
  token      text not null unique,
  status     text not null default 'open' check (status in ('open','paid','void')),
  sent_at    timestamptz,
  paid_at    timestamptz,
  method     text,
  job_id     uuid references jobs(id),       -- the receipt made when it's paid (counts in Money)
  created_at timestamptz not null default now(),
  unique (plan_id, period)
);
alter table plan_bills enable row level security;

alter table bookings add column if not exists plan_id uuid references plans(id);
alter table online_payments add column if not exists plan_bill_id uuid references plan_bills(id);
alter table online_payments drop constraint if exists online_payments_kind_check;
alter table online_payments add constraint online_payments_kind_check check (kind in ('prepay','job','invoice','plan'));

insert into message_templates (key, body) values
  ('plan_terms', E'Hi {first_name}, here is your Oil Change On The Spot maintenance plan for your {car}:\n{visits} oil changes{swaps} over 12 months for {monthly} a month + HST ({monthly_hst}).\n- Up to one oil change a month, booked whenever suits you\n- Filter and wiper labour free, you only pay for parts\n- Small top-ups included\n- 24 hours notice to move a visit\n- Leaving early: you pay the regular price for services you had, minus plan payments made\nReply I AGREE to start your plan.\n- Mathew, Oil Change On The Spot'),
  ('plan_welcome', E'Thanks {first_name}, your maintenance plan is on! Your first monthly payment of {total} is here: {pay_link}\nBook your visits anytime at {book_link} and they''re covered.\n- Mathew, Oil Change On The Spot'),
  ('plan_bill', E'Hi {first_name}, your maintenance plan payment for {month} is {total}. Pay here: {pay_link}\n- Mathew, Oil Change On The Spot')
on conflict (key) do nothing;
