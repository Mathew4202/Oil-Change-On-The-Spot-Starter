-- Remove everything made while testing HQ (see 0038 for the preview). Customers from Square and the sheet, their cars
-- and Square's appointments stay; so do logins, settings, wordings, oil specs and prices.
-- Only things made BEFORE the new site went live (Nov 1, 6:20 am) are touched: anything real since then stays.
create temp table x_cut on commit drop as select timestamptz '2026-11-01 10:20:00+00' as at;
create temp table x_cust on commit drop as
  select id from customers
  where source = 'test' or phone like '+1902555%' or email ilike '%@example.%'
     or first_name ilike 'test' or last_name ilike 'test' or first_name ilike 'test %' or last_name ilike '% test'
     or fleet_account_id in (select id from fleet_accounts where (business_name ilike '%test%' or business_name ilike '%parker%plumb%'))
     -- not switched over yet: customers made in HQ (website, phone or fleet bookings) are tests; real ones come from Square or the sheet
     or (square_customer_id is null and coalesce(source, '') in ('website', 'phone', 'fleet', ''));
delete from x_cust where id in (select id from customers where created_at >= (select at from x_cut));
create temp table x_fleet on commit drop as select id from fleet_accounts where (business_name ilike '%test%' or business_name ilike '%parker%plumb%') and created_at < (select at from x_cut);
create temp table x_jobs on commit drop as
  select id from jobs where (imported_from is null or imported_from = 'test' or customer_id in (select id from x_cust)) and done_at < (select at from x_cut);
create temp table x_book on commit drop as
  -- not switched over yet: every booking made in HQ is a test (Square's come back with the Square sync)
  select id from bookings where (coalesce(source,'') <> 'square_import'
     or customer_id in (select id from x_cust) or fleet_account_id in (select id from x_fleet)) and created_at < (select at from x_cut)
     and square_booking_id is null;   -- anything that came from Square is real, even after the switchover made it an HQ booking
create temp table x_exp on commit drop as
  select id from expenses where coalesce(source, '') not in ('expense_tracker', 'job_tracker_costs') and created_at < (select at from x_cut);

-- stock: undo what test jobs used and what test receipts added
update parts p set on_hand = p.on_hand - m.q
  from (select part_id, sum(qty) q from stock_moves where job_id in (select id from x_jobs) or expense_id in (select id from x_exp) group by part_id) m
  where p.id = m.part_id;
delete from stock_moves where job_id in (select id from x_jobs) or expense_id in (select id from x_exp);

-- money made in HQ (the sheet has the real record)
delete from online_payments where created_at < (select at from x_cut);
-- plans, referral credits and HQ's text log are new: nothing real in them yet (tests on real customers, like Harsh, go too)
delete from plan_bills where created_at < (select at from x_cut);
delete from job_items where job_id in (select id from x_jobs);
delete from jobs where id in (select id from x_jobs);
update bank_lines set payment_id = null where payment_id in (select id from payments where paid_at < (select at from x_cut) or paid_at is null);
delete from payments where paid_at < (select at from x_cut) or paid_at is null;
delete from expenses where id in (select id from x_exp);
delete from bank_imports where created_at < (select at from x_cut);   -- its lines go with it

-- bookings and everything hanging off them
update customer_credits set used_booking_id = null where used_booking_id in (select id from x_book);
create temp table x_hold on commit drop as
  select id from slot_holds where booking_id in (select id from x_book) or phone like '+1902555%' or expires_at < now();
update calls set hold_id = null where hold_id in (select id from x_hold);
delete from slot_holds where id in (select id from x_hold);
delete from messages where booking_id in (select id from x_book) or customer_id in (select id from x_cust);
delete from bookings where id in (select id from x_book);   -- notifications and route offers go with them
delete from route_offers where created_at < (select at from x_cut);
delete from notifications where created_at < (select at from x_cut);

-- test customers and fleets
delete from calls where phone like '+1902555%';
update calls set customer_id = null where customer_id in (select id from x_cust);   -- real callers' calls stay
delete from plans where created_at < (select at from x_cut);
delete from plan_requests where created_at < (select at from x_cut);
delete from customer_credits where created_at < (select at from x_cut);
delete from messages where sent_at < (select at from x_cut);
update customers set referred_by = null where referred_by in (select id from x_cust);
delete from invoices where fleet_account_id in (select id from x_fleet);
delete from vehicles where fleet_account_id in (select id from x_fleet);
delete from customers where id in (select id from x_cust);   -- their cars and credits go with them
delete from fleet_accounts where id in (select id from x_fleet);
delete from fleet_requests where (company ilike '%test%' or phone like '+1902555%') and created_at < (select at from x_cut);
delete from login_codes where created_at < (select at from x_cut);
delete from webhook_log where at < (select at from x_cut);
