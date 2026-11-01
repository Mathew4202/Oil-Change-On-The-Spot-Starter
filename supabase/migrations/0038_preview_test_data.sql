-- PREVIEW ONLY (changes nothing). Shows what 0039 will remove, so you can check before running it.
-- The sheet (Job Tracker + Expense Tracker) is the record of everything done so far, so 0039 removes everything
-- that was only made while testing HQ, then loads the sheet again.
with test_customers as (
  select id, coalesce(first_name,'') || ' ' || coalesce(last_name,'') as name, phone from customers
  where source = 'test' or phone like '+1902555%' or email ilike '%@example.%'
     or first_name ilike 'test' or last_name ilike 'test' or first_name ilike 'test %' or last_name ilike '% test'
     or fleet_account_id in (select id from fleet_accounts where business_name ilike '%test%')
),
test_fleets as (select id, business_name from fleet_accounts where business_name ilike '%test%')
select 'Test customers removed (with their cars, bookings and texts)' as what, count(*)::text as how_many,
       string_agg(trim(name) || coalesce(' ' || phone, ''), ', ' order by name) as which from test_customers
union all select 'Test fleet accounts removed', count(*)::text, string_agg(business_name, ', ') from test_fleets
union all select 'Jobs finished inside HQ removed (the sheet has the real ones)', count(*)::text,
       string_agg(to_char(done_at at time zone 'America/Halifax', 'Mon DD') || ' $' || coalesce(total, revenue, 0), ', ' order by done_at)
  from jobs where imported_from is null or imported_from = 'test'
union all select 'Past bookings removed', count(*)::text, null from bookings
  where starts_at < now() and coalesce(source,'') <> 'square_import'
union all select 'Future bookings KEPT (real customers: check these are real)', count(*)::text,
       string_agg(to_char(b.starts_at at time zone 'America/Halifax', 'Mon DD HH12:MI AM') || ' ' || coalesce(c.first_name, '?'), ', ' order by b.starts_at)
  from bookings b left join customers c on c.id = b.customer_id
  where b.starts_at >= now() and b.status in ('requested','confirmed') and (b.customer_id is null or b.customer_id not in (select id from test_customers))
     and (b.fleet_account_id is null or b.fleet_account_id not in (select id from test_fleets))
union all select 'Payments typed in HQ removed', count(*)::text, null from payments
union all select 'Receipts snapped / bank lines in HQ removed (the sheet has the real expenses)', count(*)::text,
       string_agg(to_char(spent_at, 'Mon DD') || ' ' || coalesce(description, category, '') || ' $' || total, ', ' order by spent_at)
  from expenses where coalesce(source, '') not in ('expense_tracker', 'job_tracker_costs')
union all select 'Bank statement uploads removed (upload real ones again after)', count(*)::text, null from bank_imports
union all select 'Alerts cleared', count(*)::text, null from notifications;
