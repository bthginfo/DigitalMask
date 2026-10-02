/* Never cache authenticated HTML, API responses, uploads, or personal records. */
const CACHE = "digitalmask-shell-v6";
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(["/icon.svg", "/offline.html"])));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    url.origin !== self.location.origin ||
    event.request.method !== "GET" ||
    url.pathname.startsWith("/api/")
  )
    return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("/offline.html")));
    return;
  }
  if (url.pathname === "/icon.svg" || url.pathname === "/offline.html")
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});

// Device consent metadata only; no authenticated pages, message bodies or personal records.
function deviceState(write) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("digitalmask-device", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("state");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("state", write ? "readwrite" : "readonly");
      const store = transaction.objectStore("state");
      const operation = write ? store.put(write, "push") : store.get("push");
      let value;
      operation.onsuccess = () => {
        value = operation.result;
      };
      transaction.oncomplete = () => {
        database.close();
        resolve(write || value || {});
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error);
      };
    };
  });
}
async function setBadge(count) {
  try {
    if (count && self.navigator.setAppBadge) await self.navigator.setAppBadge(count);
    else if (self.navigator.clearAppBadge) await self.navigator.clearAppBadge();
  } catch {
    /* Badging support varies by operating system. */
  }
}
function safeTarget(value) {
  try {
    const url = new URL(value || "/", self.location.origin);
    return url.origin === self.location.origin && url.pathname === "/"
      ? url.href
      : new URL("/", self.location.origin).href;
  } catch {
    return new URL("/", self.location.origin).href;
  }
}
self.addEventListener("message", (event) => {
  if (event.data?.type !== "DIGITALMASK_BADGE") return;
  event.waitUntil(
    (async () => {
      const userId = typeof event.data.userId === "string" ? event.data.userId : null;
      const count = Math.max(0, Math.floor(Number(event.data.count) || 0));
      await deviceState({ userId, count, timestamp: Number(event.data.timestamp) || Date.now() });
      await setBadge(count);
      if (!userId) {
        const notifications = await self.registration.getNotifications();
        notifications.forEach((notification) => notification.close());
      }
      event.ports[0]?.postMessage({ ok: true });
    })(),
  );
});
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let payload;
      try {
        payload = event.data?.json();
      } catch {
        return;
      }
      if (!payload || typeof payload.userId !== "string") return;
      const state = await deviceState();
      // A queued notification must not leak to a logged-out or different account on a shared phone.
      if (state.userId !== payload.userId) return;
      const count = Math.max(0, Math.floor(Number(payload.unreadCount) || 0));
      if ((Number(payload.timestamp) || 0) >= (state.timestamp || 0)) {
        await deviceState({ userId: state.userId, count, timestamp: payload.timestamp });
        await setBadge(count);
      }
      await self.registration.showNotification(
        String(payload.title || "DigitalMask").slice(0, 120),
        {
          body: String(payload.body || "Du hast eine neue Mitteilung.").slice(0, 240),
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          tag: String(payload.tag || "digitalmask"),
          data: { url: safeTarget(payload.url), userId: payload.userId },
        },
      );
    })(),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const state = await deviceState();
      const url = safeTarget(
        state.userId === event.notification.data?.userId ? event.notification.data?.url : "/",
      );
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        if ("navigate" in client) await client.navigate(url);
        await client.focus();
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
