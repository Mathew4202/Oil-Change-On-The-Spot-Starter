-- OCOTS OS: automatic texts (Quo) + review request. Safe to run again.
begin;
alter table messages add column if not exists status text;        -- sent / failed / not_set_up
alter table messages add column if not exists error text;
alter table messages add column if not exists to_phone text;
alter table messages add column if not exists provider_id text;

-- Message wording you can edit without code. {first_name} and {review_link} are filled in automatically.
create table if not exists message_templates (
  key        text primary key,
  body       text not null,
  active     boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into message_templates (key, body) values ('review_request',
'Hi {first_name}, thanks again for choosing Oil Change On The Spot today! 🚗
We hope you were happy with your service. If you have a minute, we''d really appreciate a Google review. It helps other people in HRM find us and supports our small business.
⭐ Leave a review here:
{review_link}
And remember, refer a friend or family member and you''ll receive $5 off your next oil change as a thank-you.
Thanks again, and drive safe!
– Oil Change On The Spot')
on conflict (key) do nothing;
alter table message_templates enable row level security;

insert into app_secrets (key, value) values ('review_link', '"https://g.page/r/Cc5AP8M9qC4MEAE/review"')
on conflict (key) do nothing;
commit;

select key, left(body, 60) as starts_with from message_templates;
