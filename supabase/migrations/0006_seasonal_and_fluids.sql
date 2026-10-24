-- OCOTS OS: seasonal package windows + new add-on prices. Safe to run again.
create table if not exists seasonal_windows (
  name   text primary key,
  starts text not null check (starts ~ '^\d{2}-\d{2}$'),   -- MM-DD
  ends   text not null check (ends   ~ '^\d{2}-\d{2}$')
);
insert into seasonal_windows values ('Winter tires','10-01','12-15'), ('Summer tires','03-15','05-31')
on conflict (name) do nothing;
alter table seasonal_windows enable row level security;

insert into pricing_rules values
  ('seasonal_discount', 15, 'oil change + tire change on the same visit, in season'),
  ('tire_addon_discount', 10, 'oil change + tire change on the same visit, rest of the year'),
  ('addon_price_coolant', 25, 'coolant top-up, customer price (CHECK)'),
  ('addon_price_washer_fluid', 10, 'washer fluid top-up, customer price (CHECK)'),
  ('job_minutes_parts', 45, 'parts-only visit'),
  ('job_minutes_diagnostic', 60, 'diagnostic'),
  ('job_minutes_tires', 60, 'tire change on its own'),
  ('job_minutes_tires_addon', 45, 'extra time for tires in the seasonal package')
on conflict (key) do nothing;

select name, starts, ends from seasonal_windows order by starts;
