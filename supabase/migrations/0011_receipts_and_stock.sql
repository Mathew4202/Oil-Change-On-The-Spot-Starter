-- OCOTS OS: receipt scanner (expenses + stock + prices). Safe to run again.
begin;
alter table expenses add column if not exists supplier text;           -- napa / partsource / westpier / eastcoast / other
alter table expenses add column if not exists paid_with text;          -- card / cash / on_account / etransfer
alter table expenses add column if not exists subtotal numeric(10,2);
alter table expenses add column if not exists added_by text;
alter table expenses add column if not exists bank_matched_at timestamptz;   -- set when the monthly bank statement matches it
alter table expenses add column if not exists invoice_no text;

alter table parts add column if not exists unit text default 'each';   -- each / L
alter table parts add column if not exists litres_per_unit numeric(6,2);
alter table parts add column if not exists oil_grade text;             -- for oil jugs/pails
alter table stock_moves add column if not exists unit_cost numeric(10,2);

-- Private storage for receipt photos
insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false)
on conflict (id) do nothing;
commit;

select (select count(*) from expenses) as expenses_on_file,
       (select count(*) from storage.buckets where id = 'receipts') as photo_storage_ready;
