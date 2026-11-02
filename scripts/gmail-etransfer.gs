// Paste this into script.google.com while signed in as oilchangeonthespot@gmail.com (free, runs in your own Google account).
// Every 5 minutes it sends new Interac e-Transfer emails to HQ, which marks the right bill paid (and any extra as a tip).
// 1) Put your ETRANSFER_SECRET (the password you added in Vercel) between the quotes below. Don't share it.
// 2) Run setup() once and allow access when Google asks. That's it (it replaces any timer you made before).
const HQ_URL = 'https://www.oilchangeonthespot.ca/api/etransfer';
const SECRET = 'PASTE_YOUR_SECRET_HERE';
const DONE_LABEL = 'HQ e-transfer';

function setup() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));   // only ever one timer
  ScriptApp.newTrigger('checkTransfers').timeBased().everyMinutes(5).create();
  checkTransfers();
}

function checkTransfers() {
  const label = GmailApp.getUserLabelByName(DONE_LABEL) || GmailApp.createLabel(DONE_LABEL);
  const isInterac = (t) => t.getMessages().some((m) => /payments\.interac\.ca/i.test(m.getFrom()));
  const notDone = (t) => !t.getLabels().some((l) => l.getName() === DONE_LABEL);
  // the inbox sees a new email straight away (Gmail search can take a few minutes); search catches anything archived
  const seen = {};
  const threads = GmailApp.getInboxThreads(0, 50).filter((t) => notDone(t) && isInterac(t))
    .concat(GmailApp.search(`from:payments.interac.ca newer_than:7d -label:"${DONE_LABEL}"`, 0, 30))
    .filter((t) => (seen[t.getId()] ? false : (seen[t.getId()] = true)));
  threads.forEach((thread) => {
    let allOk = true;
    thread.getMessages().forEach((m) => {
      if (!/payments\.interac\.ca/i.test(m.getFrom())) return;
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
