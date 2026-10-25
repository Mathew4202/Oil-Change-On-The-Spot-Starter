-- Fleet invoices can be paid online by card (same secure Converge page as customers use).
alter table online_payments add column if not exists invoice_id uuid references invoices(id);
alter table online_payments drop constraint if exists online_payments_kind_check;
alter table online_payments add constraint online_payments_kind_check check (kind in ('prepay','job','invoice'));
