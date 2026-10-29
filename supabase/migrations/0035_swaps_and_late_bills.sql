-- Trading two customers' times to group a day by area, and the 48-hour deadline (late fee, then interest) on pay-later bills.
begin;
-- trades: two offers share a pair_id; a "yes" waits for the other customer
alter table route_offers add column if not exists pair_id uuid;
alter table route_offers drop constraint if exists route_offers_status_check;
alter table route_offers add constraint route_offers_status_check check (status in ('sent','yes_waiting','accepted','declined','taken','not_sent','withdrawn','expired'));
create index if not exists route_offers_pair on route_offers (pair_id);

-- swap two bookings' times in one go (both must still be booked and the same length)
create or replace function swap_booking_times(a uuid, b uuid) returns boolean language plpgsql as $$
declare ra bookings%rowtype; rb bookings%rowtype;
begin
  select * into ra from bookings where id = a for update;
  select * into rb from bookings where id = b for update;
  if ra.id is null or rb.id is null then return false; end if;
  if ra.status not in ('requested','confirmed') or rb.status not in ('requested','confirmed') then return false; end if;
  if (ra.ends_at - ra.starts_at) <> (rb.ends_at - rb.starts_at) then return false; end if;
  update bookings set starts_at = starts_at + interval '100 years', ends_at = ends_at + interval '100 years' where id = a;   -- out of the way for a moment
  update bookings set starts_at = ra.starts_at, ends_at = ra.ends_at, reminder_sent_at = null where id = b;
  update bookings set starts_at = rb.starts_at, ends_at = rb.ends_at, reminder_sent_at = null where id = a;
  return true;
exception when others then return false;   -- anything clashes: nothing changes
end $$;

-- pay-later bills
alter table jobs add column if not exists bill_sent_at timestamptz;
alter table jobs add column if not exists bill_due_at timestamptz;
alter table jobs add column if not exists late_fee numeric(10,2) not null default 0;
alter table jobs add column if not exists late_interest numeric(10,2) not null default 0;
alter table jobs add column if not exists late_last_at timestamptz;
create index if not exists jobs_bill_due on jobs (bill_due_at) where bill_due_at is not null;

-- settings (change any time): due within 48 hours, then a $10 late fee, then 2% a month. 0 turns a part off.
insert into pricing_rules (key, value) values ('bill_due_hours', 48), ('late_fee', 10), ('late_interest_monthly_pct', 2)
on conflict (key) do nothing;

insert into message_templates (key, body) values
  ('bill_sent', E'Hi {first_name}, thanks for having us! Your total is {total}, due by {due_by}. Pay here (card or e-transfer): {pay_link}\n{late_terms}\n- Mathew, Oil Change On The Spot'),
  ('bill_overdue', E'Hi {first_name}, your Oil Change On The Spot bill from {day} isn''t paid yet, so {added}. You now owe {owing}. Pay here (card or e-transfer): {pay_link}\nIf you''ve already paid, just let us know!\n- Mathew')
on conflict (key) do nothing;
commit;
select (select count(*) from jobs where bill_due_at is not null) as bills, (select value from pricing_rules where key = 'late_fee') as late_fee;
