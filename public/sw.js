const CACHE = "panion-v1";

// Static assets worth caching long-term
const PRECACHE = ["/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request));
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, clone));
            return response;
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/") ?? fetch(request)),
    );
    return;
  }
});

// ----- Push notifications -----

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Panion", body: event.data.text() };
  }
  const { title, body, tag, data } = payload;
  event.waitUntil(
    self.registration.showNotification(title ?? "Panion", {
      body: body ?? "",
      tag: tag ?? "panion",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-72.png",
      data: data ?? {},
      requireInteraction: false,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((c) => c.url.includes(self.location.origin));
        if (existing) {
          existing.focus();
          existing.navigate(url);
        } else {
          self.clients.openWindow(url);
        }
      }),
  );
});

// ----- In-SW timer (fires even when app is backgrounded) -----

const timers = new Map(); // timerId -> timeoutId

self.addEventListener("message", (event) => {
  const { type, timerId, endsAt, label } = event.data ?? {};

  if (type === "TIMER_START") {
    if (timers.has(timerId)) {
      clearTimeout(timers.get(timerId));
    }
    const delay = Math.max(0, endsAt - Date.now());
    const timeoutId = setTimeout(() => {
      timers.delete(timerId);
      self.registration.showNotification("Timer done!", {
        body: label ? `${label} is ready` : "Your timer has finished.",
        tag: `timer-${timerId}`,
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-72.png",
        requireInteraction: true,
        data: { url: "/recipes" },
      });
    }, delay);
    timers.set(timerId, timeoutId);
  }

  if (type === "TIMER_CANCEL") {
    if (timers.has(timerId)) {
      clearTimeout(timers.get(timerId));
      timers.delete(timerId);
    }
  }
});
