-- OCOTS OS: build the oil spec list and filter prices from real job history.
-- Safe to run again.
begin;

alter table vehicle_specs add column if not exists times_done int default 0;
alter table vehicle_specs add column if not exists last_done date;
alter table oil_prices add column if not exists active boolean not null default true;

-- 1) Oil specs: one row per year/make/model/engine we have actually serviced
update vehicles set spec_id = null where spec_id in (select id from vehicle_specs where source = 'job_history');
delete from vehicle_specs where source = 'job_history';

insert into vehicle_specs (year_from, year_to, make, model, engine, oil_grade, capacity_l, oil_filter_part, source, verified, times_done, last_done)
select distinct on (v.year, v.make, lower(v.model), coalesce(v.engine,''))
  v.year, v.year, v.make, v.model, v.engine, j.oil_grade, j.oil_litres, j.filter_part, 'job_history', true,
  count(*) over (partition by v.year, v.make, lower(v.model), coalesce(v.engine,'')),
  (max(j.done_at) over (partition by v.year, v.make, lower(v.model), coalesce(v.engine,'')))::date
from jobs j join vehicles v on v.id = j.vehicle_id
where j.oil_grade is not null and j.oil_litres is not null and v.year is not null and v.make is not null and v.model is not null
order by v.year, v.make, lower(v.model), coalesce(v.engine,''), j.done_at desc;   -- newest job wins if notes differ

update vehicles v set spec_id = s.id from vehicle_specs s
where s.source = 'job_history' and s.year_from = v.year and s.make = v.make and lower(s.model) = lower(v.model)
  and coalesce(s.engine,'') = coalesce(v.engine,'');

-- 2) Oil filters: part numbers we have used, with the typical cost we paid
insert into parts (part_number, brand, description, category)
select distinct filter_part, 'NAPA Gold', 'Oil filter', 'oil_filter'
from jobs where filter_part is not null
on conflict (part_number, brand) do nothing;

delete from part_quotes where supplier = 'napa' and part_id in (select id from parts where category = 'oil_filter')
  and checked_at = '2026-10-24 00:00-03';
insert into part_quotes (part_id, supplier, our_cost, checked_at)
select p.id, 'napa', round(percentile_cont(0.5) within group (order by j.cost_parts)::numeric, 2), '2026-10-24 00:00-03'
from jobs j join parts p on p.part_number = j.filter_part and p.brand = 'NAPA Gold'
where j.cost_parts > 0 and j.cost_parts < 20          -- only single-filter jobs
  and j.service ilike 'oil change%' and j.service not ilike '%filter%' and j.service not ilike '%wiper%'
group by p.id;

commit;

-- What we ended up with
select (select count(*) from vehicle_specs where source='job_history') as car_specs,
       (select count(*) from vehicles where spec_id is not null) as cars_linked,
       (select count(*) from parts where category='oil_filter') as filters,
       (select count(*) from part_quotes q join parts p on p.id=q.part_id where p.category='oil_filter') as filters_with_price;
