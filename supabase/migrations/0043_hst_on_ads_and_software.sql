-- HST inside online ads and software (Mathew checked: Google Ads, Facebook, Instagram and TikTok charge tax; Anthropic's
-- receipts show "HST - Canada (14%)"). The Expense Tracker amounts include it, so the HST part comes back as a credit
-- and the cost is the amount before HST. The import had counted these as having no HST. Safe to run again.
update expenses set hst = round(total * 14 / 114, 2), subtotal = total - round(total * 14 / 114, 2)
where source = 'expense_tracker' and coalesce(hst, 0) = 0 and total > 0
  and (description ~* '(google|facebook|instagram|tiktok|meta\M|anthrop|claude)' );
select spent_at, description, total, hst, subtotal from expenses
where source = 'expense_tracker' and description ~* '(google|facebook|instagram|tiktok|meta\M|anthrop|claude)' order by spent_at;
