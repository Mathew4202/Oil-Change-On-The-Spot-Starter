-- Fleet priority: the first 2 hours of each weekday (from when your hours start that day) stay open for fleet accounts until 48 hours before. Fleets see that time on
-- their page and when you book them in HQ; everyone else sees it only once it's released (48 hours before), so it
-- still gets filled when no fleet takes it. Nobody is ever cancelled. Change the numbers here any time:
--   fleet_window_start   -1 = when that day's hours start; or a clock time in minutes after midnight (540 = 9:00 am)
--   fleet_window_minutes how long (120 = 2 hours; 0 turns fleet priority off)
--   fleet_release_hours  when it opens to everyone (48 = two days before)
--   fleet_window_weekdays_only 1 = Monday to Friday, 0 = every day
-- Paying when booking: off (0). Customers pay after the job, when the price is final. Set to 1 to offer it again
-- (only shows once Converge is set up).
insert into pricing_rules (key, value) values
  ('fleet_window_start', -1), ('fleet_window_minutes', 120), ('fleet_release_hours', 48), ('fleet_window_weekdays_only', 1),
  ('pay_at_booking', 0)
on conflict (key) do nothing;
select key, value from pricing_rules where key like 'fleet_window%' or key in ('fleet_release_hours', 'pay_at_booking') order by key;
