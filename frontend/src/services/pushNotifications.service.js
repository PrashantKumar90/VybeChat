import { api } from "./api.js";

export const notificationService = {
  getVapidPublicKey: () => api.get("/notifications/vapid-public-key"),
  subscribe: (subscription) => api.post("/notifications/subscribe", subscription),
  unsubscribe: (endpoint) => api.delete("/notifications/subscribe", { data: { endpoint } }),
  getPreferences: () => api.get("/notifications/preferences"),
  updatePreferences: (prefs) => api.patch("/notifications/preferences", prefs),
};

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

/**
 * Registers the service worker, requests Notification permission, and
 * subscribes to push. The app can't bypass browser/OS notification
 * restrictions — if the user denies permission, this simply resolves
 * false (spec §26).
 */
export async function enablePushNotifications() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, reason: "Push notifications are not supported in this browser." };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, reason: "Notification permission was not granted." };
  }

  const registration = await navigator.serviceWorker.register("/sw.js");
  const { data } = await notificationService.getVapidPublicKey();
  if (!data.publicKey) {
    return { ok: false, reason: "Push is not configured on the server yet." };
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(data.publicKey),
  });

  await notificationService.subscribe(subscription.toJSON());
  return { ok: true };
}

export async function disablePushNotifications() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await notificationService.unsubscribe(subscription.endpoint);
    await subscription.unsubscribe();
  }
}
