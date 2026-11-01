-- Anthropic charges 14% HST (it's on their receipts: "HST - Canada (14%)"), so the HST inside that expense can be
-- claimed back. The Expense Tracker import had counted it as having none.
update expenses set hst = round(total * 14 / 114, 2), subtotal = total - round(total * 14 / 114, 2)
where source = 'expense_tracker' and (description ilike '%anthrop%' or description ilike '%claude%') and coalesce(hst, 0) = 0;
select spent_at, description, total, hst, subtotal from expenses where description ilike '%anthrop%' or description ilike '%claude%';
