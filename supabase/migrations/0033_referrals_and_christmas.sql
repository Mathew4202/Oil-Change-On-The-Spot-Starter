-- Referrals that pay out by themselves, and the yearly Christmas deal.
-- Every customer gets a short referral code (their link: /r/CODE). When someone they sent us finishes their first visit,
-- they get a $5 credit that comes off their next booking on its own. Owners can also give a credit by hand in HQ.
begin;
alter table customers add column if not exists ref_code text unique;
alter table customers add column if not exists referred_by uuid references customers(id) on delete set null;

create table if not exists customer_credits (
  id                   uuid primary key default gen_random_uuid(),
  customer_id          uuid not null references customers(id) on delete cascade,
  amount               numeric(10,2) not null check (amount > 0),
  reason               text not null default 'referral',          -- referral, manual
  note                 text,
  referred_customer_id uuid references customers(id) on delete set null,
  used_booking_id      uuid references bookings(id) on delete set null,
  used_at              timestamptz,
  created_by           text,
  created_at           timestamptz not null default now()
);
create index if not exists customer_credits_open on customer_credits (customer_id) where used_at is null;
-- a friend only earns their referrer one credit, ever
create unique index if not exists customer_credits_one_per_friend on customer_credits (referred_customer_id) where reason = 'referral';
alter table customer_credits enable row level security;

-- settings (change them in pricing_rules any time)
insert into pricing_rules (key, value) values ('referral_credit', 5), ('christmas_discount', 10)
on conflict (key) do nothing;

insert into message_templates (key, body) values
  ('referral_credit', 'Hi {first_name}, thanks for sending {friend} our way! You have ${amount} off your next oil change. It comes off on its own when you book: {link}
- Mathew, Oil Change On The Spot')
on conflict (key) do nothing;
commit;
select (select count(*) from customer_credits) as credits, (select value from pricing_rules where key = 'christmas_discount') as christmas_off;
