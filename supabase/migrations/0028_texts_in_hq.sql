-- Texts from customers show up in HQ next to calls: what they want (read from the text), one tap to hold a time
-- and text the link, or reply right there. Also keeps the last two weeks of what Quo sends us, to fix problems fast.
begin;
alter table calls add column if not exists channel text not null default 'call';   -- 'call' or 'text'
alter table calls add column if not exists texts jsonb not null default '[]';       -- [{at, from: 'them'|'us', body, by}]

create table if not exists webhook_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  type       text,
  body       jsonb
);
create index if not exists webhook_log_at on webhook_log (at desc);
alter table webhook_log enable row level security;

insert into message_templates (key, body) values
  ('book_link_text', E'Hi {first_name}, thanks for your message! You can book here and see your price right away: {link}\n- Mathew, Oil Change On The Spot')
on conflict (key) do nothing;
commit;
select count(*) as calls from calls;
