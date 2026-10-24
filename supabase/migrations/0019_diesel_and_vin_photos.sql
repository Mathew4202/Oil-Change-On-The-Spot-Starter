-- Diesel pricing + optional VIN / engine-label photo on bookings.

-- Diesel oils (after HST, per litre). From the Phase 5 fleet costing:
--   15W-40 heavy-duty diesel: $95.37 per 9.5 L jug before HST -> $11.44/L (the $176.73 18.9 L pail is $10.66/L once we buy pails)
--   0W-20 diesel spec (dexosD, 3.0L Duramax): $54.99 per 4.73 L before HST -> $13.25/L
-- Any other diesel grade is priced at the dearest of these and flagged for a look.
insert into oil_prices (grade, cost_per_l, supplier, updated_at) values
  ('Diesel 15W-40', 11.44, '15W-40 CK-4 heavy-duty diesel, 9.5 L jug', now()),
  ('Diesel 0W-20', 13.25, '0W-20 dexosD diesel, 4.73 L jug', now())
on conflict (grade) do update set cost_per_l = excluded.cost_per_l, supplier = excluded.supplier, updated_at = now();

insert into pricing_rules (key, value, note) values ('diesel_filter_estimate', 20, 'diesel oil filter cost when the part price is not on file')
on conflict (key) do nothing;

-- Optional photo of the VIN or the engine label, sent with a booking when they're not sure of the engine
alter table bookings add column if not exists photo_paths text[];

-- Private storage bucket for those photos (only the server can read them; owners see them through HQ)
insert into storage.buckets (id, name, public) values ('booking-photos', 'booking-photos', false)
on conflict (id) do nothing;

select grade, cost_per_l from oil_prices where grade like 'Diesel%';

-- Fleet pricing requests from the website (Phase 5 lead tracker starts here)
create table if not exists fleet_requests (
  id            uuid primary key default gen_random_uuid(),
  company       text not null,
  contact_name  text not null,
  role          text,
  phone         text not null,
  email         text,
  vehicles      int,
  vehicle_types text,
  services      text[] not null default '{}',
  how_often     text,
  address       text,
  notes         text,
  status        text not null default 'new' check (status in ('new','contacted','quoted','won','lost')),
  created_at    timestamptz not null default now()
);
alter table fleet_requests enable row level security;
