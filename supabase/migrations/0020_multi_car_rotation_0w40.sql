-- Several cars in one booking, tire rotation, and a price for 0W-40.

-- Each car gets its own booking (own job sheet, receipt and record), back to back. group_id ties them together
-- so the customer gets one text, one link, one payment, and changing or cancelling moves them all.
alter table bookings add column if not exists group_id uuid;
create index if not exists bookings_group on bookings (group_id) where group_id is not null;

-- 0W-40 (Hemi trucks and others): East Coast doesn't carry it. Priced at Westpier's Pennzoil Platinum Euro 0W-40 ($14.35/L after HST)
-- until a cheaper source is found. Check the engine's spec (e.g. Chrysler MS-12633) on the jug before using it.
insert into oil_prices (grade, cost_per_l, supplier, updated_at) values
  ('0W-40', 14.35, 'Westpier: Pennzoil Platinum Euro 0W-40 (check the engine spec)', now())
on conflict (grade) do update set cost_per_l = excluded.cost_per_l, supplier = excluded.supplier, updated_at = now();

-- Tire rotation (wheels moved front to back on the car): 1 hour in the calendar
insert into pricing_rules (key, value, note) values ('job_minutes_rotation', 60, 'minutes for a tire rotation')
on conflict (key) do nothing;
