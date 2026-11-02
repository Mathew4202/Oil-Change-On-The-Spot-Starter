-- Cars finished in HQ whose oil didn't get saved on the car: save what the latest job used, so it's on file for next time.
with last as (
  select distinct on (j.vehicle_id) j.vehicle_id, j.oil_grade, j.oil_litres, j.filter_part, b.cars, v.year, v.make, v.model, v.engine
  from jobs j join vehicles v on v.id = j.vehicle_id left join bookings b on b.id = j.booking_id
  where v.spec_id is null and j.oil_grade is not null and j.oil_litres > 0 and v.year is not null and v.make is not null and v.model is not null
  order by j.vehicle_id, j.done_at desc
), made as (
  insert into vehicle_specs (year_from, year_to, make, model, engine, oil_grade, capacity_l, oil_filter_part, source, verified, times_done, last_done)
  select year, year, make, model, engine, oil_grade, round((oil_litres / greatest(coalesce(cars, 1), 1))::numeric, 1), filter_part, 'job_history', true, 1, current_date from last
  returning id, year_from, make, model, engine
)
update vehicles v set spec_id = m.id from made m, last l
where v.id = l.vehicle_id and m.year_from = l.year and m.make = l.make and m.model = l.model and coalesce(m.engine, '') = coalesce(l.engine, '');
select v.year, v.make, v.model, s.oil_grade, s.capacity_l, s.oil_filter_part from vehicles v join vehicle_specs s on s.id = v.spec_id where s.last_done = current_date and s.source = 'job_history';
