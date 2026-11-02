-- A note for the customer on the job ("front tires are getting bald"): shows on their receipt.
alter table jobs add column if not exists customer_note text;
