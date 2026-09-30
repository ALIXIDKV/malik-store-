/* MALIK STORE - Service Worker (khusus notifikasi; TIDAK melakukan cache / mencegat fetch) */
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].url.split("#")[0] === url.split("#")[0] && "focus" in list[i]) return list[i].focus();
    }
    return self.clients.openWindow(url);
  }));
});

// TODO(backend): tahap berikutnya (FCM / Web Push server) - server mengirim payload JSON
// {title, body, url, tag}. Struktur di bawah sudah siap dipakai.
self.addEventListener("push", function (e) {
  var d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) {}
  e.waitUntil(self.registration.showNotification(d.title || "🔔 Malik Store", {
    body: d.body || "", tag: d.tag || "malik", renotify: true, data: { url: d.url || self.registration.scope }
  }));
});
