-- Claude is only a backup for when the free AI can't do the job, and it has a hard monthly budget.
-- The app adds up what each Claude request costs and stops using it for the rest of the month at the limit.
begin;
create table if not exists ai_spend (
  month     text primary key,              -- '2026-10'
  usd       numeric(10,4) not null default 0,
  requests  int not null default 0,
  updated_at timestamptz not null default now()
);
alter table ai_spend enable row level security;
insert into pricing_rules (key, value, note) values ('ai_paid_budget_usd', 5, 'most the paid AI backup (Claude) may spend in a month, US dollars')
on conflict (key) do nothing;
commit;
select key, value from pricing_rules where key = 'ai_paid_budget_usd';
