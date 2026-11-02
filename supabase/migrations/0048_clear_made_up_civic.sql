-- The call reader's example car (2019 Honda Civic) was being copied onto calls and texts that never mentioned it. Clear it where nobody said "Civic".
update calls set extract = extract || '{"year": null, "make": null, "model": null, "engine": null}'::jsonb
where extract->>'model' = 'Civic'
  and (coalesce(transcript, '') || ' ' || coalesce(array_to_string(summary, ' '), '') || ' ' || coalesce(texts::text, '')) !~* 'civic';
