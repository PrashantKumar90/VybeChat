// Runs in its own thread, separate from the page — can't touch the DOM,
// only listens for push events and reacts to notification clicks.

self.addEventListener("push", (event) => {
  let data = { title: "New message", body: "" };
  try {
    data = event.data.json();
  } catch {
    // Non-JSON payload — fall back to the default above.
  }

  const options = {
    body: data.body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    silent: Boolean(data.silent),
    data: { groupId: data.groupId },
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Clicking the notification focuses an existing tab if one is open,
// otherwise opens a new one — either way it lands on the relevant group
// (spec §26).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const groupId = event.notification.data?.groupId;
  const targetUrl = groupId ? `/?group=${groupId}` : "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
