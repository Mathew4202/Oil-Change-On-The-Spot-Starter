-- Parts on a maintenance plan visit (a cabin filter, wipers) go on the plan's next monthly bill instead of being
-- paid at the door. Each row is one visit's extras; bill_id is set when a monthly bill picks it up.
create table if not exists plan_extras (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references plans(id),
  booking_id  uuid references bookings(id),
  job_id      uuid,
  label       text not null,
  subtotal    numeric(10,2) not null,
  hst         numeric(10,2) not null default 0,
  total       numeric(10,2) not null,
  bill_id     uuid references plan_bills(id),
  created_at  timestamptz not null default now()
);
create index if not exists plan_extras_open on plan_extras (plan_id) where bill_id is null;
alter table plan_extras enable row level security;
