-- A customer can stop the "your oil change is due" and "we're in your area" texts but still get everything about
-- a booking they make (confirmation, reminders before it, bills, receipts).
alter table customers add column if not exists promo_off boolean not null default false;
alter table customers add column if not exists promo_off_at timestamptz;
alter table customers add column if not exists promo_off_by text;
