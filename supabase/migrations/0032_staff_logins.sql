-- Staff logins for HQ (front desk, technician, manager). Owners keep signing in with OWNER_PASSWORDS.
-- Passwords are stored hashed (scrypt), never as text. session_ver goes up when a login is changed or turned off,
-- which signs that person out everywhere.
begin;
create table if not exists staff (
  username      text primary key check (username ~ '^[a-z0-9_-]{2,30}$'),
  display_name  text not null,
  role          text not null check (role in ('manager','front_desk','technician')),
  pass_hash     text not null,
  active        boolean not null default true,
  session_ver   int not null default 0,
  phone         text,
  created_by    text,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);
alter table staff enable row level security;
-- fleet links can go by email too
insert into message_templates (key, body) values
  ('fleet_portal_email', 'Hi {first_name},

Here is the {business} page with Oil Change On The Spot. Open it on any computer or phone to see your vehicles, what we found on each visit, your invoices, and to book the next yard visit:

{link}

Keep this link to yourself: anyone with it can see your account. If it ever gets shared, reply and we will send a new one.

Mathew
Oil Change On The Spot')
on conflict (key) do nothing;
commit;
select count(*) as staff_logins from staff;
