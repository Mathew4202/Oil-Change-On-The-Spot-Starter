-- Fleet accounts: vehicles with unit numbers and agreed prices, fleet visits, and invoices (monthly, or per job for BBL).

alter table fleet_accounts add column if not exists address text;                       -- the yard
alter table fleet_accounts add column if not exists invoice_email text;                 -- where invoices go (BBL: their invoice inbox)
alter table fleet_accounts add column if not exists terms_days int not null default 30; -- invoice due after
alter table fleet_accounts add column if not exists service_every_months int not null default 4;
alter table fleet_accounts add column if not exists active boolean not null default true;
alter table fleet_accounts add column if not exists via text;                            -- e.g. 'BBL Fleet' when work comes through a fleet manager

alter table vehicles add column if not exists fleet_price numeric(10,2);   -- agreed oil change price before HST (empty = our normal price)
alter table vehicles add column if not exists notes text;
alter table vehicles add column if not exists active boolean not null default true;

alter table bookings add column if not exists fleet_account_id uuid references fleet_accounts(id);
create index if not exists bookings_fleet on bookings (fleet_account_id) where fleet_account_id is not null;

create sequence if not exists invoice_numbers start 1001;
create or replace function next_invoice_no() returns int language sql as $$ select nextval('invoice_numbers')::int $$;

create table if not exists invoices (
  id            uuid primary key default gen_random_uuid(),
  fleet_account_id uuid not null references fleet_accounts(id),
  invoice_no    int not null unique,
  token         text not null unique,                 -- private link to view / print it
  period_start  date,
  period_end    date,
  issued_at     timestamptz not null default now(),
  due_at        date,
  lines         jsonb not null default '[]',            -- one line per vehicle visit
  subtotal      numeric(10,2) not null,
  hst           numeric(10,2) not null,
  total         numeric(10,2) not null,
  status        text not null default 'open' check (status in ('open','paid','void')),
  sent_at       timestamptz,
  sent_to       text,
  paid_at       timestamptz,
  paid_method   text,
  notes         text
);
alter table invoices enable row level security;

alter table jobs add column if not exists invoice_id uuid references invoices(id);

-- Fleets often pay by cheque
alter table payments drop constraint if exists payments_method_check;
alter table payments add constraint payments_method_check check (method in ('card_online','card_terminal','cash','etransfer','invoice','cheque'));

select (select count(*) from fleet_accounts) as fleet_accounts, (select count(*) from invoices) as invoices;
