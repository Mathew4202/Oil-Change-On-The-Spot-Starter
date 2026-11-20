-- Oil comes in boxes of 4 x 5 L. Restock suggestions count oil in boxes of this many litres.
insert into pricing_rules (key, value, note) values ('oil_box_litres', 20, 'litres in one box of oil (4 x 5 L)')
on conflict (key) do nothing;
