-- OCOTS OS: customers sign in with a code we text them. Safe to run again.
begin;
create table if not exists login_codes (
  id         uuid primary key default gen_random_uuid(),
  phone      text not null,
  code_hash  text not null,              -- the code itself is never stored
  expires_at timestamptz not null,
  attempts   int not null default 0,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists login_codes_phone on login_codes (phone, created_at desc);
alter table login_codes enable row level security;
commit;
select count(*) as customers_with_a_phone from customers where phone is not null;
