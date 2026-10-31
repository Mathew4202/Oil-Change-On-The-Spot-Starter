-- Texts and emails are signed by whoever sends them from HQ (Teagan, Harsh...), not always "Mathew".
-- The saved wordings get a {signer} slot; the app fills it in when the message goes out. Automatic messages say Mathew.
begin;
update message_templates set body =
  replace(replace(replace(body, '- Mathew', '- {signer}'), 'it''s Mathew', 'it''s {signer}'), E'\n\nMathew\n', E'\n\n{signer}\n')
where body like '%Mathew%';
commit;
select count(*) filter (where body like '%{signer}%') as signed_by_sender, count(*) filter (where body like '%Mathew%') as still_say_mathew from message_templates;

-- the review text after a job is signed by whoever finished it too
update message_templates set body = regexp_replace(body, E'\n- Oil Change On The Spot$', E'\n- {signer}, Oil Change On The Spot')
  where key = 'review_request' and body not like '%{signer}%';
