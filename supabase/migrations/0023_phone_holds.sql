-- Phone bookings: hold a time while you're on the call, text the caller a link, they fill in their own details.
create table if not exists slot_holds (
  id          uuid primary key default gen_random_uuid(),
  token       text not null unique,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  expires_at  timestamptz not null,
  first_name  text,
  phone       text,
  job         text not null default 'oil_change',
  cars        int not null default 1,
  note        text,
  created_by  text,
  status      text not null default 'held' check (status in ('held','booked','released')),
  booking_id  uuid references bookings(id),
  created_at  timestamptz not null default now()
);
create index if not exists slot_holds_time on slot_holds (starts_at) where status = 'held';
alter table slot_holds enable row level security;

insert into message_templates (key, body) values
  ('hold_link', E'Hi {first_name}, thanks for calling! I''m holding {when} for you. Tap here to finish booking, it takes about a minute: {link}\nI''ll keep the time until {until}.\n- Mathew, Oil Change On The Spot')
on conflict (key) do nothing;
