-- Fleet portal: each fleet account gets a private link where the fleet manager sees their vehicles, what's due,
-- visits, service history and invoices, books a yard visit and adds vehicles. No password to forget; HQ can reset the link.
begin;
alter table fleet_accounts add column if not exists portal_token text unique;
alter table fleet_accounts add column if not exists portal_sent_at timestamptz;

insert into message_templates (key, body) values
  ('fleet_portal', E'Hi {first_name}, here is your {business} page with Oil Change On The Spot: {link}\nSee every vehicle, what''s due, past services and invoices, and book a yard visit any time. Keep this link private, it works like a key.\n- Mathew, Oil Change On The Spot'),
  ('fleet_booked', E'Hi {first_name}, your yard visit is booked for {when} at {address}: {count}. We''ll text the day before.\n- Mathew, Oil Change On The Spot')
on conflict (key) do nothing;
commit;
select count(*) as fleet_accounts from fleet_accounts;
