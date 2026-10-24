-- OCOTS OS: job screen, payments and receipts. Safe to run again.
begin;
alter table bookings add column if not exists started_at timestamptz;
alter table bookings add column if not exists finished_at timestamptz;
alter table bookings add column if not exists paid_at timestamptz;

create sequence if not exists receipt_numbers start 1001;
alter table jobs add column if not exists receipt_no int unique;
alter table jobs add column if not exists receipt_token text unique;   -- private link for the customer's receipt
alter table jobs add column if not exists lines jsonb;                 -- what was charged
alter table jobs add column if not exists subtotal numeric(10,2);
alter table jobs add column if not exists hst numeric(10,2);
alter table jobs add column if not exists total numeric(10,2);
alter table jobs add column if not exists done_by text;                -- both / mathew / harsh
alter table jobs add column if not exists receipt_sent_at timestamptz;

alter table customers add column if not exists review_asked_at timestamptz;

-- Give each finished job the next receipt number
create or replace function next_receipt_no() returns int language sql as $$ select nextval('receipt_numbers')::int $$;

insert into pricing_rules values
  ('oil_interval_km', 8000, 'next oil change due after this many km'),
  ('oil_interval_months', 6, 'or after this many months, whichever comes first')
on conflict (key) do nothing;
commit;

select (select count(*) from jobs) as jobs_on_file, last_value as last_receipt_no from receipt_numbers;
