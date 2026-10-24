-- OCOTS OS: calendar rules + double-booking protection. Safe to run again.
begin;
create extension if not exists btree_gist;

-- Opening hours (same as the current website). Edit these rows to change hours.
create table if not exists business_hours (
  dow         int primary key check (dow between 0 and 6),   -- 0 = Sunday
  first_start time not null,
  last_start  time not null
);
insert into business_hours values
  (0,'13:30','22:00'),(1,'07:00','17:00'),(2,'12:00','16:00'),(3,'12:00','16:00'),
  (4,'12:00','16:00'),(5,'07:00','18:00'),(6,'10:00','22:00')
on conflict (dow) do nothing;

-- Time off / blocked time (appointments, days off, truck in the shop)
create table if not exists time_off (
  id        uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at   timestamptz not null,
  reason    text,
  created_at timestamptz not null default now()
);

-- Days the parts stores are closed: no same-day booking unless the filter is in stock
create table if not exists parts_closed_days (day date primary key, name text);
insert into parts_closed_days values
  ('2026-11-11','Remembrance Day'),('2026-12-25','Christmas'),('2026-12-26','Boxing Day'),
  ('2027-01-01','New Year''s Day'),('2027-02-15','Heritage Day'),('2027-03-26','Good Friday'),
  ('2027-03-28','Easter Sunday'),('2027-07-01','Canada Day'),('2027-08-02','Natal Day'),
  ('2027-09-06','Labour Day'),('2027-10-11','Thanksgiving'),('2027-11-11','Remembrance Day'),
  ('2027-12-25','Christmas'),('2027-12-27','Boxing Day (observed)')
on conflict (day) do nothing;

-- Booking settings
insert into pricing_rules values
  ('job_minutes', 75, '1 h 15 min per car incl. travel'),
  ('slot_step_minutes', 30, 'start times every half hour'),
  ('min_notice_minutes', 120, 'same-day bookings need 2 h notice'),
  ('max_days_ahead', 30, 'how far ahead customers can book')
on conflict (key) do nothing;

alter table bookings add column if not exists cars int not null default 1;
alter table bookings add column if not exists services jsonb;          -- add-ons, own parts, etc.
alter table bookings add column if not exists needs_review text[];     -- e.g. oil spec to confirm

-- The database itself refuses two active bookings that overlap.
-- (Old Square bookings are left out: Square sometimes allowed overlaps.)
alter table bookings drop constraint if exists bookings_no_overlap;
alter table bookings add constraint bookings_no_overlap exclude using gist (
  tstzrange(starts_at, ends_at) with &&
) where (status in ('requested','confirmed','in_progress') and coalesce(source,'') <> 'square_import');

alter table business_hours enable row level security;
alter table time_off enable row level security;
alter table parts_closed_days enable row level security;
commit;

select (select count(*) from business_hours) as days_with_hours,
       (select count(*) from parts_closed_days) as holidays,
       (select count(*) from bookings where status in ('requested','confirmed') and starts_at > now()) as upcoming_bookings;
