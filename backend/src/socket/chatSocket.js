import { Message } from "../models/Message.js";
import { Group } from "../models/Group.js";
import { canJoinGroupRoom } from "../middleware/groupAuth.middleware.js";
import { notifyGroupMembers } from "../services/webPush.service.js";

const roomName = (groupId) => `group:${groupId}`;

// In-memory only — typing state is explicitly NOT persisted to MongoDB
// (spec §22). A server restart simply clears it, which is fine.
const typingTimers = new Map(); // socket.id -> Map(groupId -> timeout)

function clearTypingTimer(socketId, groupId) {
  const perSocket = typingTimers.get(socketId);
  if (!perSocket) return;
  const timer = perSocket.get(groupId);
  if (timer) clearTimeout(timer);
  perSocket.delete(groupId);
}

/**
 * Registers all chat-related event handlers for a single authenticated
 * socket connection. Every event re-verifies group membership server-side
 * — a client claiming a groupId is never trusted on its own (spec §17, §35).
 */
export function registerChatHandlers(io, socket) {
  const { user } = socket;

  socket.on("group:join", async ({ groupId } = {}, ack) => {
    if (!groupId || !(await canJoinGroupRoom(user, groupId))) {
      return ack?.({ ok: false, error: "You do not have access to this group." });
    }
    socket.join(roomName(groupId));
    ack?.({ ok: true });
  });

  socket.on("group:leave", ({ groupId } = {}) => {
    if (!groupId) return;
    socket.leave(roomName(groupId));
    clearTypingTimer(socket.id, groupId);
  });

  socket.on("message:send", async ({ groupId, text } = {}, ack) => {
    if (!groupId || !(await canJoinGroupRoom(user, groupId))) {
      return ack?.({ ok: false, error: "You do not have access to this group." });
    }

    const trimmed = (text || "").trim();
    if (!trimmed || trimmed.length > 4000) {
      return ack?.({ ok: false, error: "Message text is required (max 4000 characters)." });
    }

    const message = await Message.create({
      groupId,
      senderId: user._id,
      type: "TEXT",
      text: trimmed,
    });

    const payload = {
      id: message._id,
      groupId,
      type: "TEXT",
      text: message.text,
      createdAt: message.createdAt,
      sender: { id: user._id, displayName: user.displayName },
    };

    io.to(roomName(groupId)).emit("message:new", payload);
    ack?.({ ok: true, message: payload });

    // Push covers members who don't have the tab open/focused — fire and
    // forget so it never blocks the real-time broadcast above.
    Group.findById(groupId)
      .then((group) =>
        notifyGroupMembers({
          groupId,
          groupName: group?.name || "a group",
          senderId: user._id,
          senderDisplayName: user.displayName,
          previewText: trimmed,
        })
      )
      .catch((err) => console.error("[push] notifyGroupMembers failed:", err.message));
  });

  socket.on("typing:start", async ({ groupId } = {}) => {
    if (!groupId || !(await canJoinGroupRoom(user, groupId))) return;

    socket.to(roomName(groupId)).emit("typing:update", {
      groupId,
      userId: user._id,
      displayName: user.displayName,
      isTyping: true,
    });

    // Auto-expire after 5s in case the client never sends typing:stop
    // (closed tab, dropped connection, etc.) — keeps indicators honest.
    if (!typingTimers.has(socket.id)) typingTimers.set(socket.id, new Map());
    clearTypingTimer(socket.id, groupId);
    const timer = setTimeout(() => {
      socket.to(roomName(groupId)).emit("typing:update", {
        groupId,
        userId: user._id,
        displayName: user.displayName,
        isTyping: false,
      });
    }, 5000);
    typingTimers.get(socket.id).set(groupId, timer);
  });

  socket.on("typing:stop", ({ groupId } = {}) => {
    if (!groupId) return;
    clearTypingTimer(socket.id, groupId);
    socket.to(roomName(groupId)).emit("typing:update", {
      groupId,
      userId: user._id,
      displayName: user.displayName,
      isTyping: false,
    });
  });

  socket.on("disconnect", () => {
    const perSocket = typingTimers.get(socket.id);
    if (perSocket) {
      perSocket.forEach((timer) => clearTimeout(timer));
      typingTimers.delete(socket.id);
    }
  });
}
