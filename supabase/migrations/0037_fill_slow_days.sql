-- Filling a slow day: two days out, if there are open times, a few customers coming due who live near the jobs
-- already booked get a text with a filled-in booking link. Set fill_in_texts_per_day to 0 to turn it off.
insert into pricing_rules (key, value) values ('fill_in_texts_per_day', 3) on conflict (key) do nothing;
insert into message_templates (key, body) values
  ('fill_in', 'Hi {first_name}, it''s {signer} from Oil Change On The Spot. We''ll be in {area} on {day} and your {car} is coming up for an oil change. We have {times} open. Book in a minute here, your details are filled in: {link}')
on conflict (key) do nothing;
select (select value from pricing_rules where key = 'fill_in_texts_per_day') as fill_ins_per_day, (select count(*) from message_templates where key = 'fill_in') as wording;
