-- Online car lookups cost money (AI + web search), so each car is looked up once, ever, and never twice at the same time.
-- A failed lookup isn't retried for 30 days, and there's a daily cap (pricing rule ai_lookups_per_day).
begin;
create table if not exists spec_lookups (
  key        text primary key,          -- year|make|model (|filter for a filter-only lookup)
  status     text not null,             -- pending, done, failed
  tried_at   timestamptz not null default now()
);
create index if not exists spec_lookups_tried on spec_lookups (tried_at desc);
alter table spec_lookups enable row level security;

insert into pricing_rules (key, value, note) values ('ai_lookups_per_day', 25, 'online car lookups allowed per day (each about 5 cents)')
on conflict (key) do nothing;
commit;
select key, value from pricing_rules where key = 'ai_lookups_per_day';
