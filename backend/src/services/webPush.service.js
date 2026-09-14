import webpush from "web-push";
import { PushSubscription } from "../models/PushSubscription.js";
import { NotificationPreference } from "../models/NotificationPreference.js";
import { GroupMember } from "../models/GroupMember.js";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.WEB_PUSH_SUBJECT || "mailto:admin@example.com",
    process.env.WEB_PUSH_PUBLIC_KEY,
    process.env.WEB_PUSH_PRIVATE_KEY
  );
  configured = true;
}

/**
 * Sends a push notification to every subscribed device for a single user,
 * respecting their notification preferences. Dead subscriptions (expired
 * or revoked — HTTP 404/410 from the push service) are removed so we
 * don't keep retrying them forever (spec §28).
 */
async function sendToUser(userId, { title, body, groupId }) {
  ensureConfigured();

  const prefs = await NotificationPreference.findOne({ userId });
  if (prefs && prefs.groupMessageNotifications === false) return;

  const subscriptions = await PushSubscription.find({ userId });
  if (subscriptions.length === 0) return;

  const showPreview = !prefs || prefs.messagePreview !== false;
  const payload = JSON.stringify({
    title,
    body: showPreview ? body : "New message",
    groupId,
    silent: prefs ? prefs.notificationSound === false : false,
  });

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload
        );
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await PushSubscription.deleteOne({ _id: sub._id });
        } else {
          console.error("[push] send failed:", err.message);
        }
      }
    })
  );
}

/**
 * Notifies every ACTIVE member of a group except the sender. Used after a
 * text or image message is persisted, alongside the Socket.IO broadcast —
 * push covers people who don't have the tab open/focused.
 */
export async function notifyGroupMembers({ groupId, groupName, senderId, senderDisplayName, previewText }) {
  const members = await GroupMember.find({
    groupId,
    status: "ACTIVE",
    userId: { $ne: senderId },
  });

  await Promise.all(
    members.map((m) =>
      sendToUser(m.userId, {
        title: `${senderDisplayName} sent a message in ${groupName}`,
        body: previewText,
        groupId,
      })
    )
  );
}
