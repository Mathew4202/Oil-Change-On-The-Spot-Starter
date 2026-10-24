-- OCOTS OS: phone notifications for OCOTS HQ. Safe to run again.
create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  owner      text not null,                 -- mathew / harsh
  endpoint   text not null unique,          -- the phone's push address
  p256dh     text not null,
  auth       text not null,
  device     text,
  created_at timestamptz not null default now(),
  last_ok    timestamptz
);
alter table push_subscriptions enable row level security;

-- Server-only settings that must never reach a browser (e.g. the push signing keys, made automatically)
create table if not exists app_secrets (
  key        text primary key,
  value      jsonb not null,
  created_at timestamptz not null default now()
);
alter table app_secrets enable row level security;

select (select count(*) from push_subscriptions) as phones_signed_up;
