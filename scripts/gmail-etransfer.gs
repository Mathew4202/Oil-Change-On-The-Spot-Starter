// Paste this into script.google.com while signed in as oilchangeonthespot@gmail.com (free, runs in your own Google account).
// Every 10 minutes it sends new Interac e-Transfer emails to HQ, which marks the right bill paid (and any extra as a tip).
// 1) Put your CRON_SECRET (the value from Vercel) between the quotes below. Don't share it.
// 2) Run setup() once and allow access when Google asks. That's it.
const HQ_URL = 'https://www.oilchangeonthespot.ca/api/etransfer';
const SECRET = 'PASTE_YOUR_CRON_SECRET_HERE';
const DONE_LABEL = 'HQ e-transfer';

function setup() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('checkTransfers').timeBased().everyMinutes(10).create();
  checkTransfers();
}

function checkTransfers() {
  const label = GmailApp.getUserLabelByName(DONE_LABEL) || GmailApp.createLabel(DONE_LABEL);
  const threads = GmailApp.search(`from:payments.interac.ca newer_than:7d -label:"${DONE_LABEL}"`, 0, 30);
  threads.forEach((thread) => {
    let allOk = true;
    thread.getMessages().forEach((m) => {
      const res = UrlFetchApp.fetch(HQ_URL, {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { Authorization: 'Bearer ' + SECRET },
        payload: JSON.stringify({ id: m.getId(), subject: m.getSubject(), body: m.getPlainBody(), date: m.getDate().toISOString() }),
      });
      if (res.getResponseCode() !== 200) { allOk = false; console.log(res.getResponseCode() + ' ' + res.getContentText()); }
    });
    if (allOk) thread.addLabel(label);   // done: never sent twice (HQ also ignores repeats)
  });
}
