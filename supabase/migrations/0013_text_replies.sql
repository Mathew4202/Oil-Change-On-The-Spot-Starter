-- OCOTS OS: customers replying STOP / START to our texts (through Quo). Safe to run again.
begin;
alter table customers add column if not exists sms_opt_out_at timestamptz;
alter table customers add column if not exists sms_opt_out_by text;      -- 'reply' (they texted STOP) or the owner's name
alter table messages add column if not exists from_phone text;
create unique index if not exists messages_inbound_once on messages (provider_id) where direction = 'in' and provider_id is not null;
commit;
select count(*) filter (where sms_opt_out) as texts_off from customers;
