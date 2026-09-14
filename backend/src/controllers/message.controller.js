import { Message } from "../models/Message.js";
import { MessageRead } from "../models/MessageRead.js";
import { GroupMember } from "../models/GroupMember.js";
import { uploadImage } from "../services/imageStorage.service.js";
import { notifyGroupMembers } from "../services/webPush.service.js";
import {
  detectImageMimeType,
  ALLOWED_IMAGE_TYPES,
} from "../utils/imageValidation.js";

const PAGE_SIZE = 30;

// --- GET /api/groups/:groupId/messages?before=<ISO timestamp> ---
// Cursor-based pagination: first call omits `before` and gets the latest
// 30; scrolling up passes the createdAt of the oldest loaded message.
// Never loads the whole history into memory (spec §20, §51).
export async function getMessages(req, res) {
  const { before } = req.query;
  const filter = { groupId: req.group._id };

  if (before) {
    const beforeDate = new Date(before);

    if (isNaN(beforeDate.getTime())) {
      return res.status(400).json({
        error: "Invalid 'before' cursor.",
      });
    }

    filter.createdAt = { $lt: beforeDate };
  }

  const messages = await Message.find(filter)
    .sort({ createdAt: -1 })
    .limit(PAGE_SIZE)
    .populate("senderId", "displayName");

  const nextCursor =
    messages.length === PAGE_SIZE
      ? messages[messages.length - 1].createdAt
      : null;

  return res.status(200).json({
    messages: messages.reverse().map(formatMessage),
    nextCursor,
  });
}

// --- POST /api/groups/:groupId/read ---
// Marks everything in the group read up to now.
export async function markGroupRead(req, res) {
  await MessageRead.findOneAndUpdate(
    {
      userId: req.user._id,
      groupId: req.group._id,
    },
    {
      $set: {
        lastReadAt: new Date(),
      },
    },
    {
      upsert: true,
    }
  );

  return res.status(200).json({
    message: "Marked as read.",
  });
}

// --- GET /api/groups/unread-counts ---
// One round trip for the sidebar's unread badges across every group the
// user belongs to.
export async function listUnreadCounts(req, res) {
  const memberships = await GroupMember.find({
    userId: req.user._id,
    status: "ACTIVE",
  });

  const reads = await MessageRead.find({
    userId: req.user._id,
  });

  const lastReadByGroup = new Map(
    reads.map((r) => [
      r.groupId.toString(),
      r.lastReadAt,
    ])
  );

  const counts = await Promise.all(
    memberships.map(async (m) => {
      const lastReadAt =
        lastReadByGroup.get(m.groupId.toString()) ||
        m.joinedAt;

      const unreadCount = await Message.countDocuments({
        groupId: m.groupId,
        createdAt: { $gt: lastReadAt },
        senderId: { $ne: req.user._id },
      });

      return {
        groupId: m.groupId,
        unreadCount,
      };
    })
  );

  return res.status(200).json({
    counts,
  });
}

// --- Format message for API/socket consumers ---
export function formatMessage(message) {
  // Some old messages may have a senderId that no longer resolves
  // during populate(). Never allow that to crash the backend.
  const senderId =
    message.senderId?._id ||
    message.senderId ||
    null;

  const displayName =
    message.senderId?.displayName ||
    "Unknown User";

  return {
    id: message._id,
    groupId: message.groupId,
    type: message.type,
    text: message.text,
    image: message.image,
    createdAt: message.createdAt,

    sender: {
      id: senderId,
      displayName,
    },
  };
}

// --- POST /api/groups/:groupId/messages/image  (multipart, field "image") ---
// The frontend only calls this once the user has confirmed the preview
// (spec §24) — this endpoint validates, uploads externally, persists
// metadata only, and broadcasts in real time.
export async function sendImageMessage(req, res) {
  if (!req.file) {
    return res.status(400).json({
      error: "An image file is required.",
    });
  }

  // Never trust the browser-declared MIME type alone — sniff the actual
  // bytes (spec §24, §51).
  const realMimeType = detectImageMimeType(req.file.buffer);

  if (
    !realMimeType ||
    !ALLOWED_IMAGE_TYPES.includes(realMimeType)
  ) {
    return res.status(400).json({
      error:
        "Unsupported image format. Allowed: JPEG, PNG, WEBP, GIF.",
    });
  }

  let uploaded;

  try {
    uploaded = await uploadImage(
      req.file.buffer,
      realMimeType
    );
  } catch (err) {
    console.error(
      "[image] upload failed:",
      err.message
    );

    return res.status(502).json({
      error:
        "Image upload failed. Please try again.",
    });
  }

  const message = await Message.create({
    groupId: req.group._id,
    senderId: req.user._id,
    type: "IMAGE",
    image: {
      ...uploaded,
      mimeType: realMimeType,
    },
  });

  const payload = {
    id: message._id,
    groupId: req.group._id,
    type: "IMAGE",
    image: message.image,
    createdAt: message.createdAt,
    sender: {
      id: req.user._id,
      displayName: req.user.displayName,
    },
  };

  // Broadcast alongside text messages sent over the socket, so every
  // client renders both message types through the same "message:new" event.
  const io = req.app.locals.io;

  if (io) {
    io.to(`group:${req.group._id}`).emit(
      "message:new",
      payload
    );
  }

  notifyGroupMembers({
    groupId: req.group._id,
    groupName: req.group.name,
    senderId: req.user._id,
    senderDisplayName: req.user.displayName,
    previewText: "📷 Sent an image",
  }).catch((err) =>
    console.error(
      "[push] notifyGroupMembers failed:",
      err.message
    )
  );

  return res.status(201).json({
    message: payload,
  });
}