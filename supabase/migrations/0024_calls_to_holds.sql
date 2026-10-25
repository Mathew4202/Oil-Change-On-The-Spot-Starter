-- Calls from Quo: who called, what they want (read from Quo's call summary / transcript), and a suggested time,
-- so holding the time and texting the booking link is one tap.
create table if not exists calls (
  id              uuid primary key default gen_random_uuid(),
  provider_id     text not null unique,            -- Quo call id
  phone           text,
  direction       text,
  status          text,                            -- answered, unanswered, ai-handled, ...
  duration        int,
  started_at      timestamptz,
  summary         text[],
  next_steps      text[],
  transcript      text,
  extract         jsonb,                           -- name, car, service, when they want it
  suggested_start timestamptz,
  customer_id     uuid references customers(id),
  hold_id         uuid references slot_holds(id),
  state           text not null default 'open' check (state in ('open','held','linked','done')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists calls_open on calls (created_at desc) where state = 'open';
alter table calls enable row level security;

alter table slot_holds add column if not exists car_year int;
alter table slot_holds add column if not exists car_make text;
alter table slot_holds add column if not exists car_model text;
alter table slot_holds add column if not exists call_id uuid references calls(id);

insert into message_templates (key, body) values
  ('book_link', E'Hi {first_name}, thanks for calling Oil Change On The Spot! You can book here and see your price right away: {link}\n- Mathew, Oil Change On The Spot')
on conflict (key) do nothing;
