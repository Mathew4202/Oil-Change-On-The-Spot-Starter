-- Same-day bookings: 1 hour notice (was 2). A gap between jobs can be booked up to an hour before it starts.
update pricing_rules set value = 60 where key = 'min_notice_minutes';
