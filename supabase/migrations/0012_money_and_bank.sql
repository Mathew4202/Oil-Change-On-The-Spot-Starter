-- OCOTS OS: Money tab (profit and loss, HST) and the monthly bank statement upload. Safe to run again.
begin;

-- One row per statement file uploaded
create table if not exists bank_imports (
  id          uuid primary key default gen_random_uuid(),
  file_name   text,
  account     text,                        -- e.g. "BMO chequing 1234", "BMO Mastercard 5678"
  from_date   date,
  to_date     date,
  lines       int,
  added_by    text,
  created_at  timestamptz not null default now()
);

-- One row per line on the statement. amount < 0 is money out, > 0 is money in.
create table if not exists bank_lines (
  id           uuid primary key,
  import_id    uuid references bank_imports(id) on delete cascade,
  account      text,
  posted_on    date not null,
  amount       numeric(10,2) not null,
  description  text,
  line_key     text not null unique,       -- stops the same line being added twice when statements overlap
  status       text not null default 'needs_look'
               check (status in ('matched','auto','needs_look','done')),
  kind         text,                       -- receipt, napa_account, payment, card_payout, bank_fee, transfer, expense_no_receipt, personal, money_in
  category     text,                       -- suggested or chosen spending category
  expense_ids  uuid[],
  payment_id   uuid references payments(id),
  note         text,
  decided_by   text,
  created_at   timestamptz not null default now()
);
create index if not exists bank_lines_posted on bank_lines (posted_on);
create index if not exists bank_lines_status on bank_lines (status);

alter table expenses add column if not exists bank_line_id uuid references bank_lines(id) on delete set null;
alter table payments add column if not exists bank_line_id uuid references bank_lines(id) on delete set null;

alter table bank_imports enable row level security;
alter table bank_lines enable row level security;
commit;

select (select count(*) from bank_lines) as bank_lines_on_file;
