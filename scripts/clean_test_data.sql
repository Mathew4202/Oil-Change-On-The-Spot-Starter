-- Remove everything made while testing HQ (see 0038 for the preview). Real customers, their phone numbers, cars and
-- future bookings stay; so do logins, settings, wordings, oil specs and prices.
create temp table x_cust on commit drop as
  select id from customers
  where source = 'test' or phone like '+1902555%' or email ilike '%@example.%'
     or first_name ilike 'test' or last_name ilike 'test' or first_name ilike 'test %' or last_name ilike '% test'
     or fleet_account_id in (select id from fleet_accounts where business_name ilike '%test%');
create temp table x_fleet on commit drop as select id from fleet_accounts where business_name ilike '%test%';
create temp table x_jobs on commit drop as
  select id from jobs where imported_from is null or imported_from = 'test' or customer_id in (select id from x_cust);
create temp table x_book on commit drop as
  select id from bookings where (starts_at < now() and coalesce(source,'') <> 'square_import')
     or customer_id in (select id from x_cust) or fleet_account_id in (select id from x_fleet);
create temp table x_exp on commit drop as
  select id from expenses where coalesce(source, '') not in ('expense_tracker', 'job_tracker_costs');

-- stock: undo what test jobs used and what test receipts added
update parts p set on_hand = p.on_hand - m.q
  from (select part_id, sum(qty) q from stock_moves where job_id in (select id from x_jobs) or expense_id in (select id from x_exp) group by part_id) m
  where p.id = m.part_id;
delete from stock_moves where job_id in (select id from x_jobs) or expense_id in (select id from x_exp);

-- money made in HQ (the sheet has the real record)
delete from online_payments;
delete from plan_bills where job_id in (select id from x_jobs) or plan_id in (select id from plans where customer_id in (select id from x_cust));
delete from job_items where job_id in (select id from x_jobs);
delete from jobs where id in (select id from x_jobs);
update bank_lines set payment_id = null;
delete from payments;
delete from expenses where id in (select id from x_exp);
delete from bank_imports;   -- its lines go with it

-- bookings and everything hanging off them
update customer_credits set used_booking_id = null where used_booking_id in (select id from x_book);
create temp table x_hold on commit drop as
  select id from slot_holds where booking_id in (select id from x_book) or phone like '+1902555%' or expires_at < now();
update calls set hold_id = null where hold_id in (select id from x_hold);
delete from slot_holds where id in (select id from x_hold);
delete from messages where booking_id in (select id from x_book) or customer_id in (select id from x_cust);
delete from bookings where id in (select id from x_book);   -- notifications and route offers go with them
delete from route_offers;
delete from notifications;

-- test customers and fleets
delete from calls where customer_id in (select id from x_cust) or phone like '+1902555%';
delete from plans where customer_id in (select id from x_cust);
update customers set referred_by = null where referred_by in (select id from x_cust);
delete from invoices where fleet_account_id in (select id from x_fleet);
delete from vehicles where fleet_account_id in (select id from x_fleet);
delete from customers where id in (select id from x_cust);   -- their cars and credits go with them
delete from fleet_accounts where id in (select id from x_fleet);
delete from fleet_requests where company ilike '%test%' or phone like '+1902555%';
delete from plan_requests where phone like '+1902555%';
delete from login_codes;
delete from webhook_log;
