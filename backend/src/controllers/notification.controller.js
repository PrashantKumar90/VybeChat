import { PushSubscription } from "../models/PushSubscription.js";
import { NotificationPreference } from "../models/NotificationPreference.js";

// --- GET /api/notifications/vapid-public-key ---
export async function getVapidPublicKey(req, res) {
  return res.status(200).json({ publicKey: process.env.WEB_PUSH_PUBLIC_KEY || "" });
}

// --- POST /api/notifications/subscribe ---
// Body: { endpoint, keys: { p256dh, auth } } — the raw PushSubscription
// object the browser's Push API returns. Upserted by endpoint so
// re-subscribing the same device/browser doesn't create duplicates.
export async function subscribe(req, res) {
  const { endpoint, keys } = req.body;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: "A valid push subscription is required." });
  }

  await PushSubscription.findOneAndUpdate(
    { endpoint },
    { userId: req.user._id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    { upsert: true }
  );

  return res.status(200).json({ message: "Subscribed to push notifications." });
}

// --- DELETE /api/notifications/subscribe  { endpoint } ---
export async function unsubscribe(req, res) {
  const { endpoint } = req.body;
  if (!endpoint) {
    return res.status(400).json({ error: "endpoint is required." });
  }

  await PushSubscription.deleteOne({ endpoint, userId: req.user._id });
  return res.status(200).json({ message: "Unsubscribed." });
}

// --- GET /api/notifications/preferences ---
export async function getPreferences(req, res) {
  const prefs =
    (await NotificationPreference.findOne({ userId: req.user._id })) ||
    (await NotificationPreference.create({ userId: req.user._id }));

  return res.status(200).json({ preferences: prefs });
}

// --- PATCH /api/notifications/preferences ---
export async function updatePreferences(req, res) {
  const { groupMessageNotifications, messagePreview, notificationSound } = req.body;

  const update = {};
  if (typeof groupMessageNotifications === "boolean") update.groupMessageNotifications = groupMessageNotifications;
  if (typeof messagePreview === "boolean") update.messagePreview = messagePreview;
  if (typeof notificationSound === "boolean") update.notificationSound = notificationSound;

  const prefs = await NotificationPreference.findOneAndUpdate(
    { userId: req.user._id },
    { $set: update },
    { upsert: true, new: true }
  );

  return res.status(200).json({ preferences: prefs });
}
