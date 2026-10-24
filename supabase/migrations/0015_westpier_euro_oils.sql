-- OCOTS OS: all four Westpier Euro oils from Shawn Langille's quote (Oct 21 2026), per litre after HST.
-- Worked out as (Ecobox price / 22.7 L + $0.25/L NS environmental fee) x 1.14. Safe to run again.
-- Snapping a Westpier receipt in HQ updates these automatically from then on.
begin;
insert into oil_prices (grade, cost_per_l, supplier, updated_at) values
  ('Euro 0W-30', 10.73, 'Westpier: Pennzoil Platinum Euro LX 0W-30 (VW 504/507, MB 229.51/52, Porsche C30)', now()),
  ('Euro 5W-30', 13.81, 'Westpier: Pennzoil Platinum Euro L 5W-30 (BMW LL-04, MB 229.51)', now()),
  ('Euro 0W-40', 14.35, 'Westpier: Pennzoil Platinum Euro 0W-40 (40-weight specs)', now()),
  ('Euro 0W-20', 15.45, 'Westpier: Pennzoil Platinum Euro AV-L 0W-20 (VW 508/509, MB 229.71, BMW LL-17FE)', now())
on conflict (grade) do update set cost_per_l = excluded.cost_per_l, supplier = excluded.supplier, updated_at = now();
commit;
select grade, cost_per_l, supplier from oil_prices where grade like 'Euro%' order by cost_per_l;
