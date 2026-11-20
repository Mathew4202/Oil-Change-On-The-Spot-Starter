-- An oil change is 45 min on site per car. The drive between visits is now counted from the map
-- (lib/os/slots.ts driveMin), so it is no longer padded into this number.
-- Bookings already made keep the time they were booked with.
update pricing_rules
   set value = 45,
       note = '45 min on site per car (the drive between visits is counted from the map)'
 where key = 'job_minutes';
