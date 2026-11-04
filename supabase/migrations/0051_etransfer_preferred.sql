-- Bill text: e-transfer preferred (card fees are higher), card still offered. Only changes it if it's still the original wording.
update message_templates
set body = replace(body, 'Pay here (card or e-transfer): {pay_link}', 'E-transfer preferred, or pay by card here: {pay_link}')
where key = 'bill_sent' and body like '%Pay here (card or e-transfer): {pay_link}%';
