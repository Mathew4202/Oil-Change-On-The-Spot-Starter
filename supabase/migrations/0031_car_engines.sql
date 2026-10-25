-- Every car's engine sizes from the free US EPA fuel economy list (fueleconomy.gov), loaded once from HQ.
-- The engine dropdown reads this instantly, so no AI or web search is needed to list a car's engines.
begin;
create table if not exists car_engines (
  year       int  not null,
  make       text not null,
  model      text not null,          -- EPA base model name, e.g. "Civic", "CR-V", "F150 Pickup"
  model_key  text not null,          -- for matching: lower case, letters and digits, no drive/body words
  engine     text not null,          -- "2.0L 4-cyl", "1.5L 4-cyl Turbo", "2.5L 4-cyl Hybrid", "6.7L 6-cyl Diesel"
  cylinders  int,
  fuel       text,                   -- gas, hybrid, diesel, plug-in
  primary key (year, make, model, engine)
);
create index if not exists car_engines_find on car_engines (year, make);
alter table car_engines enable row level security;
commit;
select count(*) as engines from car_engines;
