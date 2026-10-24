-- OCOTS OS: booking confirmation, day-before reminder, oil-change-due reminder, self-serve change/cancel. Safe to run again.
begin;
alter table bookings add column if not exists manage_token text unique;       -- private change/cancel link
alter table bookings add column if not exists reminder_sent_at timestamptz;
alter table bookings add column if not exists cancelled_at timestamptz;
alter table bookings add column if not exists cancel_reason text;
alter table jobs add column if not exists due_reminder_sent_at timestamptz;
alter table customers add column if not exists sms_opt_out boolean not null default false;

-- Plain text only (no emojis) so each text costs less. {placeholders} are filled in automatically.
insert into message_templates (key, body) values
('booking_confirmation',
'Hi {first_name}, you''re booked with Oil Change On The Spot for {when} ({car}) at {address}. Total {total} with HST, paid after the job.
Need to change or cancel? {manage_link}
- Mathew, Oil Change On The Spot'),
('day_before',
'Hi {first_name}, just a reminder we''ll see you tomorrow at {time} for your {car} at {address}. Please leave the car where we can reach it, and the keys if you won''t be home.
Need to change it? {manage_link}
- Mathew, Oil Change On The Spot'),
('oil_due',
'Hi {first_name}, your {car} is due for an oil change around now. Book a time that suits you in under a minute: {book_link}
- Mathew, Oil Change On The Spot. Reply STOP to stop reminders.'),
('booking_moved',
'Hi {first_name}, your Oil Change On The Spot booking for your {car} is now {when}. See you then!
- Mathew, Oil Change On The Spot'),
('booking_cancelled',
'Hi {first_name}, your Oil Change On The Spot booking for {when} ({car}) has been cancelled. If that''s a mistake or you''d like a new time, call or text 782-640-8341.
- Mathew, Oil Change On The Spot')
on conflict (key) do nothing;

insert into pricing_rules values
  ('free_cancel_hours', 24, 'customers can change or cancel online for free up to this many hours before'),
  ('due_reminder_days_before', 3, 'send the oil-change-due text this many days before the due date')
on conflict (key) do nothing;
commit;

select key from message_templates order by key;
