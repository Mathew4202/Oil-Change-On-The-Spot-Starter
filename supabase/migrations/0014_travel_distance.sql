-- OCOTS OS: travel fee from the driving distance (Google Maps). Safe to run again.
begin;
-- Each address is looked up once, then remembered (saves Google lookups)
create table if not exists travel_cache (
  key        text primary key,            -- place:<google id> or addr:<address>
  km         numeric(6,1) not null,
  minutes    int,
  from_base  text,                        -- which start point was closer
  address    text,
  created_at timestamptz not null default now()
);
alter table travel_cache enable row level security;

-- Where we drive from. Distance is measured from whichever is closer. Edit here if you move.
insert into app_secrets (key, value) values ('travel_bases', '["77 Collingwood Court, Dartmouth, NS", "164 Flying Cloud Ch, Dartmouth, NS"]')
on conflict (key) do nothing;
commit;
select value as start_points from app_secrets where key = 'travel_bases';
