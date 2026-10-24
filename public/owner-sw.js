// OCOTS HQ service worker: shows booking notifications and opens the right day when tapped.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let msg = { title: "OCOTS HQ", body: "", url: "/owner" };
  try { msg = Object.assign(msg, event.data ? event.data.json() : {}); } catch (e) { msg.body = event.data ? event.data.text() : ""; }
  event.waitUntil(self.registration.showNotification(msg.title, {
    body: msg.body,
    icon: "/android-chrome-192x192.png",
    badge: "/favicon-32x32.png",
    tag: msg.tag || undefined,
    data: { url: msg.url || "/owner" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/owner";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (c.url.includes("/owner")) { await c.focus(); if ("navigate" in c) await c.navigate(url); return; }
    }
    await self.clients.openWindow(url);
  })());
});
