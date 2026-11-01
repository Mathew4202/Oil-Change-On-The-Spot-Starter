-- Puts back the two appointments 0039 removed by mistake (Kierstan Mon Nov 2 10:00 am, Crystal Sun Nov 15 1:30 pm),
-- with their car, address, price and a change-or-cancel link, as normal HQ bookings (HQ sends the reminder the day
-- before). Safe to run again: it won't add them twice.
insert into bookings (customer_id, vehicle_id, starts_at, ends_at, status, source, square_booking_id, address, cars, services,
  quoted_total, quote_breakdown, notes, manage_token, pay_mode)
select c.id, v.id, x.starts::timestamptz, x.ends::timestamptz, 'confirmed', 'phone', x.sq, coalesce(c.address, x.addr), 1, x.services::jsonb,
  x.total, x.breakdown::jsonb, x.notes, substr(md5(random()::text || clock_timestamp()::text), 1, 20), 'after'
from (values
  ('F9PSAWBMH3DH0W2FXVFD3VQP20', '+19028188663', 'ywilcspbt1tx1f', '2026-11-02 10:00-04', '2026-11-02 11:15-04', '5 catamaran rd', 'spark',
   '{"job": "oil_change"}', 114.00,
   '{"lines": [{"label": "Full synthetic oil change (0W-20, 4 L)", "amount": 90}, {"label": "Price changed by Mathew", "amount": 10}], "subtotal": 100, "hst": 14, "total": 114, "profit": null}',
   '2022 Chevrolet Spark (LT)'),
  ('2Q15450YWK14K20ENZ4PFAPK5R', '+17824142103', 'r4ggezs2n8wr7w', '2026-11-15 13:30-04', '2026-11-15 14:45-04', '556 Bedford Hwy Apt 114', 'ilx',
   '{"job": "tires"}', 91.20,
   '{"lines": [{"label": "Tire change (on rims)", "amount": 80}], "subtotal": 80, "hst": 11.2, "total": 91.2, "profit": 80}',
   '2019 Acura ilx')
) as x(sqc, phone, sq, starts, ends, addr, model, services, total, breakdown, notes)
-- the customer: by their Square ID, or else by their phone number
join lateral (select * from customers where square_customer_id = x.sqc or phone = x.phone
  order by (square_customer_id = x.sqc) desc nulls last limit 1) c on true
left join lateral (select id from vehicles where customer_id = c.id and model ilike x.model order by year desc nulls last limit 1) v on true
where not exists (select 1 from bookings b where b.square_booking_id = x.sq);

-- check: both should be listed with their car
select to_char(b.starts_at at time zone 'America/Halifax', 'Dy Mon DD HH12:MI AM') as "when",
  trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')) as customer,
  coalesce(v.year || ' ' || v.make || ' ' || v.model, '(no car)') as car, b.quoted_total as total, b.services->>'job' as job
from bookings b join customers c on c.id = b.customer_id left join vehicles v on v.id = b.vehicle_id
where b.square_booking_id in ('ywilcspbt1tx1f', 'r4ggezs2n8wr7w');
