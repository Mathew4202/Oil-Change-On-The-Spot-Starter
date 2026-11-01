-- Switchover day: HQ takes over from Square. Run this AFTER the last "Pull from Square now" and after Square's online
-- booking is turned off. Safe to run again.
-- 1) Appointments booked in Square that haven't happened yet become normal HQ bookings: HQ sends their reminder the day
--    before, can move them, and they count for route grouping. (Their Square ID stays, so nothing is pulled twice.)
update bookings set source = 'phone'
  where source = 'square_import' and starts_at > now() and status in ('requested', 'confirmed');
-- 2) Stop pulling from Square every evening.
insert into pricing_rules (key, value) values ('square_sync', 0)
  on conflict (key) do update set value = 0;
-- what's coming up in HQ now
select to_char(b.starts_at at time zone 'America/Halifax', 'Dy Mon DD HH12:MI AM') as "when",
  trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) as customer,
  coalesce(v.year || ' ' || v.make || ' ' || v.model, '(no car)') as car, b.services->>'job' as job
from bookings b left join customers c on c.id = b.customer_id left join vehicles v on v.id = b.vehicle_id
where b.starts_at > now() and b.status in ('requested', 'confirmed') order by b.starts_at;
