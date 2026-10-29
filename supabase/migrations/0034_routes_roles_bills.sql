-- Grouping each day's jobs by area, more staff roles, and the pay-later bill.
begin;
-- map points for addresses (free OpenStreetMap lookups, each address once)
create table if not exists geo_cache (
  key  text primary key,
  lat  double precision,
  lng  double precision,
  at   timestamptz not null default now()
);
alter table geo_cache enable row level security;

-- "Can we move you to a closer time?" texts and their answers
create table if not exists route_offers (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references bookings(id) on delete cascade,
  from_start  timestamptz not null,
  to_start    timestamptz not null,
  saved_km    numeric(6,1),
  status      text not null default 'sent' check (status in ('sent','accepted','declined','taken','not_sent','expired')),
  expires_at  timestamptz not null,
  answered_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists route_offers_booking on route_offers (booking_id);
alter table route_offers enable row level security;

-- staff roles: accountant, sales and fleets, marketing, trainee
alter table staff drop constraint if exists staff_role_check;
alter table staff add constraint staff_role_check check (role in ('manager','front_desk','technician','accountant','fleet_sales','marketing','trainee'));

-- settings: how many "closer time" texts per day at most (0 turns it off)
insert into pricing_rules (key, value) values ('route_offers_per_day', 3) on conflict (key) do nothing;

insert into message_templates (key, body) values
  ('route_offer', 'Hi {first_name}, it''s Mathew from Oil Change On The Spot. To keep our route tight on {day}, could we move your appointment from {old_time} to {new_time}? Reply YES to move it or NO to keep {old_time}. Either is totally fine!')
on conflict (key) do nothing;
commit;
select (select count(*) from route_offers) as offers, (select value from pricing_rules where key = 'route_offers_per_day') as per_day;
