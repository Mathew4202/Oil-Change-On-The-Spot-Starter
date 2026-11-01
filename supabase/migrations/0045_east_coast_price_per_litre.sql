-- East Coast invoice 308 (Oct 30): $6.20/L 0W-20 and $6.22/L 5W-20 before HST, read as per 20 L case by mistake ($0.35/L).
-- Right cost after HST: 0W-20 $7.07/L, 5W-20 $7.09/L.
update oil_prices set cost_per_l = 7.07, updated_at = now() where grade = '0W-20' and cost_per_l < 2;
update oil_prices set cost_per_l = 7.09, updated_at = now() where grade = '5W-20' and cost_per_l < 2;
update stock_moves m set unit_cost = case p.part_number when 'OIL-0W-20' then 7.07 else 7.09 end
  from parts p where p.id = m.part_id and p.part_number in ('OIL-0W-20', 'OIL-5W-20') and m.unit_cost < 2;
update part_quotes q set our_cost = case p.part_number when 'OIL-0W-20' then 7.07 else 7.09 end
  from parts p where p.id = q.part_id and p.part_number in ('OIL-0W-20', 'OIL-5W-20') and q.our_cost < 2;
select grade, cost_per_l from oil_prices where grade in ('0W-20', '5W-20');
