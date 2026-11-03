-- Fleet vans that live at the driver's home overnight: where each one is usually parked (blank = the yard).
alter table vehicles add column if not exists parked_at text;
