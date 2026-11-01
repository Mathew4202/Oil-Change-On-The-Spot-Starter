# Builds supabase/migrations/0039_clean_and_reload_real_data.sql:
#   python3 scripts/build_reset_sql.py tracker.xlsx square_orders.json
# tracker.xlsx = the Finance Tracker downloaded as Excel; square_orders.json = Square orders search result ({"orders": [...]})
import subprocess, sys, os
here = os.path.dirname(os.path.abspath(__file__))
tmp = '/tmp/ocots_import.sql'
subprocess.run([sys.executable, os.path.join(here, 'job_tracker_to_sql.py'), sys.argv[1], tmp, sys.argv[2]], check=True)
imp, clean = open(tmp).read(), open(os.path.join(here, 'clean_test_data.sql')).read()
head, rest = imp.split('\nbegin;\n', 1)
body, tail = rest.split('\ncommit;\n', 1)
out = """-- OCOTS: remove all the test data from HQ, then load the real jobs, expenses, HST and tips again from the
-- Finance Tracker and Square. Run 0038 first to see what goes. Safe to run again.
-- Everything happens in one go: if anything fails, nothing changes.
begin;
""" + clean + "\n-- ===== the real record: Job Tracker + Expense Tracker (+ Square HST and tips) =====\n" + body + """
commit;

-- what's in HQ now
select (select count(*) from jobs) as jobs, (select sum(revenue) from jobs) as sales_before_hst, (select sum(tip) from jobs) as tips,
  (select count(*) from expenses) as expenses, (select sum(coalesce(subtotal, total - coalesce(hst,0))) from expenses) as money_out_before_hst,
  (select count(*) from customers) as customers, (select count(*) from bookings where starts_at >= now()) as upcoming_bookings;
""" + tail
open(os.path.join(here, '..', 'supabase', 'migrations', '0039_clean_and_reload_real_data.sql'), 'w').write(out)
print('wrote 0039')
