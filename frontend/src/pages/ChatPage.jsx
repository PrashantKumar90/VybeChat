import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { groupService } from "../services/group.service.js";
import { getSocket } from "../socket/socket.js";
import { validateImageFile } from "../utils/imageValidation.js";

let typingDebounceTimer = null;

export default function ChatPage() {
  const { user, logout } = useAuth();
  const [groups, setGroups] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [typingUsers, setTypingUsers] = useState({}); // userId -> displayName
  const [draft, setDraft] = useState("");
  const [pendingImage, setPendingImage] = useState(null); // { file, previewUrl }
  const [imageError, setImageError] = useState("");
  const [sendingImage, setSendingImage] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const messageListRef = useRef(null);
  const socketRef = useRef(null);
  const fileInputRef = useRef(null);

  // --- initial load: groups + unread badges, connect socket once ---
  useEffect(() => {
    groupService.listGroups().then(({ data }) => setGroups(data.groups));
    refreshUnreadCounts();

    const socket = getSocket();
    socketRef.current = socket;
    socket.connect();

    socket.on("message:new", handleIncomingMessage);
    socket.on("typing:update", handleTypingUpdate);

    return () => {
      socket.off("message:new", handleIncomingMessage);
      socket.off("typing:update", handleTypingUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refreshUnreadCounts() {
    groupService.listUnreadCounts().then(({ data }) => {
      const map = {};
      data.counts.forEach((c) => (map[c.groupId] = c.unreadCount));
      setUnreadCounts(map);
    });
  }

  function handleIncomingMessage(payload) {
    setMessages((prev) => {
      if (payload.groupId !== activeGroupIdRef.current) return prev;
      return [...prev, payload];
    });
    if (payload.groupId !== activeGroupIdRef.current) {
      refreshUnreadCounts();
    } else {
      scrollToBottom();
    }
  }

  function handleTypingUpdate({ groupId, userId, displayName, isTyping }) {
    if (groupId !== activeGroupIdRef.current) return;
    setTypingUsers((prev) => {
      const next = { ...prev };
      if (isTyping) next[userId] = displayName;
      else delete next[userId];
      return next;
    });
  }

  // Ref mirror so socket callbacks (registered once) always see the
  // latest selected group without re-subscribing on every switch.
  const activeGroupIdRef = useRef(null);
  useEffect(() => {
    activeGroupIdRef.current = activeGroupId;
  }, [activeGroupId]);

  async function openGroup(groupId) {
    if (activeGroupId) {
      socketRef.current.emit("group:leave", { groupId: activeGroupId });
    }

    setActiveGroupId(groupId);
    setMessages([]);
    setTypingUsers({});
    setNextCursor(null);

    socketRef.current.emit("group:join", { groupId }, (ack) => {
      if (!ack?.ok) console.error("Failed to join group room:", ack?.error);
    });

    const { data } = await groupService.getMessages(groupId);
    setMessages(data.messages);
    setNextCursor(data.nextCursor);
    scrollToBottom();

    await groupService.markRead(groupId);
    setUnreadCounts((prev) => ({ ...prev, [groupId]: 0 }));
  }

  async function loadOlderMessages() {
    if (!nextCursor || !activeGroupId) return;
    const container = messageListRef.current;
    const prevScrollHeight = container?.scrollHeight || 0;

    const { data } = await groupService.getMessages(activeGroupId, nextCursor);
    setMessages((prev) => [...data.messages, ...prev]);
    setNextCursor(data.nextCursor);

    // Preserve scroll position instead of jumping to the top.
    requestAnimationFrame(() => {
      if (container) {
        container.scrollTop = container.scrollHeight - prevScrollHeight;
      }
    });
  }

  function handleScroll(e) {
    if (e.target.scrollTop < 80) loadOlderMessages();
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      const el = messageListRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  function sendMessage(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !activeGroupId) return;

    socketRef.current.emit("message:send", { groupId: activeGroupId, text }, (ack) => {
      if (!ack?.ok) console.error("Failed to send message:", ack?.error);
    });
    setDraft("");
    socketRef.current.emit("typing:stop", { groupId: activeGroupId });
  }

  const handleDraftChange = useCallback(
    (value) => {
      setDraft(value);
      if (!activeGroupId) return;

      socketRef.current.emit("typing:start", { groupId: activeGroupId });

      clearTimeout(typingDebounceTimer);
      typingDebounceTimer = setTimeout(() => {
        socketRef.current.emit("typing:stop", { groupId: activeGroupId });
      }, 2000);
    },
    [activeGroupId]
  );

  // --- Image sharing: upload button, clipboard paste, drag & drop ---
  // All three funnel into the same preview-then-confirm flow (spec §24) —
  // nothing is uploaded until the user explicitly hits Send.
  function stageImageFile(file) {
    if (!file) return;
    const error = validateImageFile(file);
    if (error) {
      setImageError(error);
      return;
    }
    setImageError("");
    setPendingImage({ file, previewUrl: URL.createObjectURL(file) });
  }

  function handleFileInputChange(e) {
    stageImageFile(e.target.files?.[0]);
    e.target.value = ""; // allow picking the same file again later
  }

  function handleComposerPaste(e) {
    const item = Array.from(e.clipboardData?.items || []).find((i) =>
      i.type.startsWith("image/")
    );
    if (item) {
      e.preventDefault();
      stageImageFile(item.getAsFile());
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = Array.from(e.dataTransfer.files || []).find((f) =>
      f.type.startsWith("image/")
    );
    stageImageFile(file);
  }

  function cancelImagePreview() {
    if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage(null);
    setImageError("");
  }

  async function confirmSendImage() {
    if (!pendingImage || !activeGroupId) return;
    setSendingImage(true);
    try {
      await groupService.sendImage(activeGroupId, pendingImage.file);
      cancelImagePreview();
    } catch (err) {
      setImageError(err.response?.data?.error || "Failed to send image.");
    } finally {
      setSendingImage(false);
    }
  }

  const activeGroup = groups.find((g) => g._id === activeGroupId);
  const typingNames = Object.values(typingUsers);

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b border-slate-200 px-4 py-3 flex items-center justify-between bg-white">
        <h1 className="font-semibold text-slate-800">Group Chat</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-500">{user.displayName || user.email}</span>
          {user.role === "SUPER_ADMIN" && (
            <Link to="/admin/users" className="text-slate-500 underline">
              Admin
            </Link>
          )}
          <Link to="/notification-settings" className="text-slate-500 underline">
            Notifications
          </Link>
          <button onClick={logout} className="text-slate-500 underline">
            Log out
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* --- Groups sidebar --- */}
        <aside className="w-64 border-r border-slate-200 bg-white overflow-y-auto hidden sm:block">
          {groups.map((g) => (
            <button
              key={g._id}
              onClick={() => openGroup(g._id)}
              className={`w-full text-left px-4 py-3 border-b border-slate-100 flex justify-between items-center hover:bg-slate-50 ${
                g._id === activeGroupId ? "bg-slate-100" : ""
              }`}
            >
              <span className="truncate">{g.name}</span>
              {unreadCounts[g._id] > 0 && (
                <span className="ml-2 shrink-0 rounded-full bg-slate-800 text-white text-xs px-2 py-0.5">
                  {unreadCounts[g._id]}
                </span>
              )}
            </button>
          ))}
          {groups.length === 0 && (
            <p className="p-4 text-sm text-slate-400">No groups yet.</p>
          )}
        </aside>

        {/* --- Main chat --- */}
        <main
          className="flex-1 flex flex-col min-h-0 relative"
          onDragOver={(e) => {
            e.preventDefault();
            if (activeGroupId) setIsDraggingOver(true);
          }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={activeGroupId ? handleDrop : undefined}
        >
          {isDraggingOver && (
            <div className="absolute inset-0 z-10 bg-slate-800/70 flex items-center justify-center text-white text-lg font-medium pointer-events-none">
              Drop image to share
            </div>
          )}
          {!activeGroupId ? (
            <div className="flex-1 flex items-center justify-center text-slate-400">
              Select a group to start chatting
            </div>
          ) : (
            <>
              <div className="border-b border-slate-200 px-4 py-3 bg-white">
                <h2 className="font-medium text-slate-800">{activeGroup?.name}</h2>
              </div>

              <div
                ref={messageListRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-slate-50"
              >
                {messages.map((m) => (
                  <MessageBubble key={m.id} message={m} isOwn={m.sender.id === user.id} />
                ))}
              </div>

              {typingNames.length > 0 && (
                <div className="px-4 py-1 text-xs text-slate-400 italic bg-slate-50">
                  {typingNames.join(", ")} {typingNames.length === 1 ? "is" : "are"} typing...
                </div>
              )}

              {pendingImage && (
                <div className="border-t border-slate-200 p-3 bg-white flex items-center gap-3">
                  <img
                    src={pendingImage.previewUrl}
                    alt="Preview"
                    className="h-16 w-16 object-cover rounded-md border border-slate-200"
                  />
                  <div className="flex-1 text-sm text-slate-500">
                    {imageError ? (
                      <span className="text-red-600">{imageError}</span>
                    ) : (
                      "Ready to send this image?"
                    )}
                  </div>
                  <button
                    onClick={cancelImagePreview}
                    className="px-3 py-1.5 text-sm rounded-md border border-slate-300 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmSendImage}
                    disabled={sendingImage || Boolean(imageError)}
                    className="px-3 py-1.5 text-sm rounded-md bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    {sendingImage ? "Sending..." : "Send"}
                  </button>
                </div>
              )}

              <form onSubmit={sendMessage} className="border-t border-slate-200 p-3 flex gap-2 bg-white">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach image"
                  className="rounded-md border border-slate-300 px-3 py-2 text-slate-600 hover:bg-slate-50"
                >
                  📎
                </button>
                <input
                  value={draft}
                  onChange={(e) => handleDraftChange(e.target.value)}
                  onPaste={handleComposerPaste}
                  placeholder="Type a message, or paste/drag an image..."
                  className="flex-1 rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-500"
                />
                <button
                  type="submit"
                  className="rounded-md bg-slate-800 px-4 py-2 text-white font-medium hover:bg-slate-700"
                >
                  Send
                </button>
              </form>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function MessageBubble({ message, isOwn }) {
  return (
    <div className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-xs sm:max-w-md rounded-lg px-3 py-2 ${
          isOwn ? "bg-slate-800 text-white" : "bg-white border border-slate-200 text-slate-800"
        }`}
      >
        {!isOwn && (
          <p className="text-xs font-medium text-slate-500 mb-0.5">{message.sender.displayName}</p>
        )}
        {message.type === "IMAGE" ? (
          <img
            src={message.image.url}
            alt="Shared"
            className="max-w-full rounded-md"
            style={{ maxHeight: 260 }}
          />
        ) : (
          <p className="text-sm whitespace-pre-wrap break-words">{message.text}</p>
        )}
        <p className={`text-[10px] mt-1 ${isOwn ? "text-slate-300" : "text-slate-400"}`}>
          {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
}
