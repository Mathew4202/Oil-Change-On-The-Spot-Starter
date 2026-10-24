-- OCOTS OS core schema (Week 1)
-- Replaces Square customers/calendar/invoices and the Job Tracker sheets.

create extension if not exists "pgcrypto";

-- ---------- Customers and vehicles ----------
create table customers (
  id            uuid primary key default gen_random_uuid(),
  first_name    text,
  last_name     text,
  phone         text unique,              -- E.164, used for SMS-code login
  email         text,
  address       text,
  city          text,
  postal_code   text,
  lat           double precision,
  lng           double precision,
  account_opt_in boolean not null default false,  -- customer chose to save info
  marketing_opt_in boolean not null default false,
  fleet_account_id uuid,
  square_customer_id text unique,          -- kept for the import
  notes         text,
  created_at    timestamptz not null default now()
);

create table fleet_accounts (
  id            uuid primary key default gen_random_uuid(),
  business_name text not null,
  contact_name  text,
  phone         text,
  email         text,
  billing       text not null default 'monthly' check (billing in ('monthly','per_job')),
  flat_price    numeric(10,2),             -- e.g. 105.00 per vehicle
  notes         text,
  created_at    timestamptz not null default now()
);
alter table customers add constraint customers_fleet_fk
  foreign key (fleet_account_id) references fleet_accounts(id);

-- Oil spec per engine, filled by lookup + our own history
create table vehicle_specs (
  id            uuid primary key default gen_random_uuid(),
  year_from     int not null,
  year_to       int not null,
  make          text not null,
  model         text not null,
  engine        text,                      -- e.g. '3.5L V6', '2.0T'
  fuel          text check (fuel in ('gas','diesel','hybrid')),
  oil_grade     text not null,             -- '0W-20'
  oil_spec      text,                      -- 'VW 504/507', 'dexos1'
  capacity_l    numeric(4,1) not null,
  oil_filter_part text,                    -- reference part number
  source        text default 'manual',
  verified      boolean not null default false
);
create index on vehicle_specs (make, model, year_from, year_to);

create table vehicles (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid references customers(id) on delete cascade,
  fleet_account_id uuid references fleet_accounts(id),
  unit_number   text,                      -- fleet unit #
  year          int,
  make          text,
  model         text,
  engine        text,
  vin           text,
  plate         text,
  spec_id       uuid references vehicle_specs(id),
  last_km       int,
  created_at    timestamptz not null default now()
);

-- ---------- Services and pricing ----------
create table services (
  code          text primary key,          -- 'oil_change','diagnostic','battery','wipers','filters','tire_rotation','seasonal'
  name          text not null,
  base_price    numeric(10,2),             -- flat part of the price
  labour_rate   numeric(10,2),             -- per hour, if hourly
  standalone_fee numeric(10,2),            -- $50 call-out when booked alone
  addon_price   numeric(10,2),             -- price when added to an oil change
  active        boolean not null default true
);

insert into services (code, name, base_price, labour_rate, standalone_fee, addon_price) values
  ('oil_change',   'Full synthetic oil change', null, null, null, null),
  ('diagnostic',   'Diagnostic',               100, null, null, null),
  ('repair',       'Repair labour',            null, 100, null, null),
  ('battery',      'Battery install',          null, null, 50, 20),
  ('wipers',       'Wiper blades',             null, null, 50, 15),
  ('filters',      'Engine / cabin filter',    null, null, 50, 10),
  ('tire_rotation','Tire rotation',            null, null, null, null);

create table pricing_rules (
  key           text primary key,
  value         numeric(10,2) not null,
  note          text
);
insert into pricing_rules values
  ('consumables', 1,   'added to every oil change'),
  ('profit_floor', 45, 'min profit per oil change'),
  ('profit_target', 60,'target profit'),
  ('free_travel_km', 30, 'free radius'),
  ('hst_rate', 0.14,  'NS HST');

create table oil_prices (
  grade         text primary key,          -- '0W-20', 'Euro 0W-30'
  cost_per_l    numeric(6,2) not null,     -- after HST
  supplier      text,
  updated_at    timestamptz not null default now()
);
insert into oil_prices (grade, cost_per_l, supplier) values
  ('5W-20', 6.61, 'East Coast'), ('5W-30', 6.61, 'East Coast'),
  ('0W-20', 7.18, 'East Coast'), ('0W-16', 8.21, 'East Coast'),
  ('5W-40', 7.30, 'East Coast'), ('Euro 0W-30', 10.73, 'Westpier'),
  ('15W-40', 6.15, 'Westpier');

-- ---------- Parts and stock ----------
create table parts (
  id            uuid primary key default gen_random_uuid(),
  part_number   text not null,
  brand         text,
  description   text,
  category      text,                      -- 'oil_filter','cabin_filter','wiper','battery','oil'
  on_hand       numeric(8,2) not null default 0,
  reorder_at    numeric(8,2) default 0,
  unique (part_number, brand)
);

create table part_quotes (                 -- NAPA / PartSource price checks
  id            uuid primary key default gen_random_uuid(),
  part_id       uuid references parts(id) on delete cascade,
  supplier      text not null check (supplier in ('napa','partsource','westpier','eastcoast','other')),
  our_cost      numeric(10,2),
  retail        numeric(10,2),             -- we charge NAPA retail
  checked_at    timestamptz not null default now()
);

create table stock_moves (
  id            uuid primary key default gen_random_uuid(),
  part_id       uuid references parts(id),
  qty           numeric(8,2) not null,     -- + received, - used
  reason        text check (reason in ('receipt','job','adjust','order')),
  job_id        uuid,
  expense_id    uuid,
  at            timestamptz not null default now()
);

-- ---------- Bookings and jobs ----------
create table bookings (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid references customers(id),
  vehicle_id    uuid references vehicles(id),
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  address       text,
  distance_km   numeric(6,1),
  status        text not null default 'requested'
                check (status in ('requested','confirmed','in_progress','done','cancelled','no_show')),
  pay_mode      text not null default 'after' check (pay_mode in ('online','after','fleet_invoice')),
  quoted_total  numeric(10,2),
  quote_breakdown jsonb,                   -- oil, filter, consumables, travel, add-ons
  source        text default 'website',    -- website, phone, fleet, square_import
  square_booking_id text unique,
  notes         text,
  created_at    timestamptz not null default now()
);
create index on bookings (starts_at);

create table jobs (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid references bookings(id),
  vehicle_id    uuid references vehicles(id),
  done_at       timestamptz,
  km            int,
  oil_grade     text,
  oil_litres    numeric(4,1),
  revenue       numeric(10,2),
  cost_oil      numeric(10,2),
  cost_parts    numeric(10,2),
  cost_other    numeric(10,2),
  profit        numeric(10,2) generated always as
                (coalesce(revenue,0) - coalesce(cost_oil,0) - coalesce(cost_parts,0) - coalesce(cost_other,0)) stored,
  inspection    jsonb,                     -- fluids, filters, wipers findings
  next_due_km   int,
  next_due_date date,
  review_requested boolean not null default false,
  imported_from text                       -- 'job_tracker' for history
);

create table job_items (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid references jobs(id) on delete cascade,
  service_code  text references services(code),
  part_id       uuid references parts(id),
  qty           numeric(8,2) default 1,
  price         numeric(10,2),
  cost          numeric(10,2)
);

-- ---------- Money ----------
create table payments (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid references bookings(id),
  fleet_account_id uuid references fleet_accounts(id),
  amount        numeric(10,2) not null,
  method        text check (method in ('card_online','card_terminal','cash','etransfer','invoice')),
  processor_ref text,
  paid_at       timestamptz not null default now()
);

create table expenses (
  id            uuid primary key default gen_random_uuid(),
  vendor        text,
  total         numeric(10,2) not null,
  hst           numeric(10,2),
  category      text,                      -- oil, parts, fuel, tools, software, other
  receipt_url   text,                      -- photo in Supabase storage
  parsed        jsonb,                     -- line items read from the photo
  spent_at      date not null default current_date,
  created_at    timestamptz not null default now()
);

-- ---------- Messages (SMS / email / Quo calls) ----------
create table messages (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid references customers(id),
  booking_id    uuid references bookings(id),
  channel       text check (channel in ('sms','email','call')),
  direction     text check (direction in ('out','in')),
  kind          text,                      -- confirmation, reminder, done, review, due_soon
  body          text,
  sent_at       timestamptz not null default now()
);

-- Lock everything down; the app talks to these through server routes.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
