// Service worker: shows check-in reminders sent by the server and opens the site when tapped.
self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(d.title || "I'm always in your heart", {
    body: d.body || "Come talk with me a while.",
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    tag: "wwjd-checkin",
    data: { url: d.url || "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) if (new URL(w.url).origin === self.location.origin && "focus" in w) { await w.navigate(url).catch(() => {}); return w.focus(); }
    return clients.openWindow(url);
  })());
});
