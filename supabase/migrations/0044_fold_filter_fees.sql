-- NAPA's "035 FILTERS LESS THAN 8IN" is an environmental fee on each filter, not a part.
-- Receipts snapped from now on add it to the filter's price. This removes the 035 "part" that a receipt already put in stock.
update job_items set part_id = null where part_id in (select id from parts where part_number ~ '^0*35$');
delete from stock_moves where part_id in (select id from parts where part_number ~ '^0*35$');
delete from parts where part_number ~ '^0*35$';   -- its price checks go with it
