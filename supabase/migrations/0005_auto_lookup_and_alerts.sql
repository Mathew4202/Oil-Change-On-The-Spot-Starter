-- OCOTS OS: automatic oil spec lookup + in-app alerts (no emails). Safe to run again.
begin;
alter table vehicle_specs add column if not exists confidence text;
alter table vehicle_specs add column if not exists sources jsonb;
alter table vehicle_specs add column if not exists wix_filter text;
alter table vehicle_specs add column if not exists looked_up_at timestamptz;
create unique index if not exists vehicle_specs_lookup_once
  on vehicle_specs (year_from, lower(make), lower(model), coalesce(engine,'')) where source = 'ai_lookup';

-- Alerts that show up in the owner calendar app
create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,          -- new_booking, cancelled, payment, etc.
  title      text not null,
  body       text,
  booking_id uuid references bookings(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists notifications_unread on notifications (created_at desc) where read_at is null;
alter table notifications enable row level security;

-- Typical part prices used until a real price is on file (edit any time)
insert into pricing_rules values
  ('filter_estimate', 6.50, 'oil filter cost when the part has no price yet'),
  ('euro_filter_estimate', 15, 'Euro oil filter cost when the part has no price yet'),
  ('addon_part_wipers', 22, 'wiper blades (pair) charged to customer'),
  ('addon_part_cabin_filter', 22, 'cabin air filter charged to customer'),
  ('addon_part_engine_filter', 21, 'engine air filter charged to customer'),
  ('addon_part_battery', 200, 'battery charged to customer')
on conflict (key) do nothing;
commit;

select (select count(*) from pricing_rules) as price_settings,
       (select count(*) from vehicle_specs) as car_specs;
