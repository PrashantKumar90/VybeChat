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
  const [typingUsers, setTypingUsers] = useState({});
  const [draft, setDraft] = useState("");
  const [pendingImage, setPendingImage] = useState(null);
  const [imageError, setImageError] = useState("");
  const [sendingImage, setSendingImage] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const messageListRef = useRef(null);
  const socketRef = useRef(null);
  const fileInputRef = useRef(null);
  const activeGroupIdRef = useRef(null);
  const openGroupRequestRef = useRef(0);
  const loadingOlderRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    async function loadGroups() {
      try {
        const { data } = await groupService.listGroups();
        if (mounted) setGroups(data.groups || []);
      } catch (err) {
        console.error("Failed to load groups:", err);
      }
    }

    loadGroups();
    refreshUnreadCounts();

    const socket = getSocket();
    socketRef.current = socket;

    socket.off("message:new", handleIncomingMessage);
    socket.off("typing:update", handleTypingUpdate);

    socket.on("message:new", handleIncomingMessage);
    socket.on("typing:update", handleTypingUpdate);

    if (!socket.connected) socket.connect();

    return () => {
      mounted = false;
      socket.off("message:new", handleIncomingMessage);
      socket.off("typing:update", handleTypingUpdate);

      if (activeGroupIdRef.current) {
        socket.emit("group:leave", {
          groupId: activeGroupIdRef.current,
        });
      }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    activeGroupIdRef.current = activeGroupId;
  }, [activeGroupId]);

  async function refreshUnreadCounts() {
    try {
      const { data } = await groupService.listUnreadCounts();
      const map = {};

      (data.counts || []).forEach((item) => {
        map[item.groupId] = item.unreadCount;
      });

      setUnreadCounts(map);
    } catch (err) {
      console.error("Failed to load unread counts:", err);
    }
  }

  function getMessageId(message) {
    return message?.id || message?._id || null;
  }

  function mergeMessages(existing, incoming) {
    const result = [];
    const seenIds = new Set();

    for (const message of [...existing, ...incoming]) {
      const id = getMessageId(message);

      if (id) {
        const normalizedId = String(id);

        if (seenIds.has(normalizedId)) continue;

        seenIds.add(normalizedId);
      }

      result.push(message);
    }

    return result;
  }

  function handleIncomingMessage(payload) {
    const currentGroupId = activeGroupIdRef.current;

    if (payload?.groupId !== currentGroupId) {
      refreshUnreadCounts();
      return;
    }

    setMessages((prev) => mergeMessages(prev, [payload]));
    scrollToBottom();
  }

  function handleTypingUpdate({
    groupId,
    userId,
    displayName,
    isTyping,
  }) {
    if (groupId !== activeGroupIdRef.current) return;

    setTypingUsers((prev) => {
      const next = { ...prev };

      if (isTyping) next[userId] = displayName;
      else delete next[userId];

      return next;
    });
  }

  async function openGroup(groupId) {
    if (!socketRef.current) return;

    const previousGroupId = activeGroupIdRef.current;

    if (previousGroupId && previousGroupId !== groupId) {
      socketRef.current.emit("group:leave", {
        groupId: previousGroupId,
      });
    }

    activeGroupIdRef.current = groupId;

    setActiveGroupId(groupId);
    setMessages([]);
    setTypingUsers({});
    setNextCursor(null);
    setDraft("");

    cancelImagePreview();

    const requestId = ++openGroupRequestRef.current;

    socketRef.current.emit(
      "group:join",
      { groupId },
      (ack) => {
        if (!ack?.ok) {
          console.error(
            "Failed to join group room:",
            ack?.error
          );
        }
      }
    );

    try {
      const { data } = await groupService.getMessages(groupId);

      if (
        requestId !== openGroupRequestRef.current ||
        activeGroupIdRef.current !== groupId
      ) {
        return;
      }

      setMessages(
        mergeMessages([], data.messages || [])
      );

      setNextCursor(data.nextCursor || null);

      await groupService.markRead(groupId);

      if (
        requestId !== openGroupRequestRef.current ||
        activeGroupIdRef.current !== groupId
      ) {
        return;
      }

      setUnreadCounts((prev) => ({
        ...prev,
        [groupId]: 0,
      }));

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (activeGroupIdRef.current === groupId) {
            scrollToBottom();
          }
        });
      });
    } catch (err) {
      console.error("Failed to load group messages:", err);
    }
  }

  function closeMobileChat() {
    const currentGroupId = activeGroupIdRef.current;

    if (currentGroupId && socketRef.current) {
      socketRef.current.emit("group:leave", {
        groupId: currentGroupId,
      });
    }

    activeGroupIdRef.current = null;

    setActiveGroupId(null);
    setMessages([]);
    setTypingUsers({});
    setNextCursor(null);
    setDraft("");

    cancelImagePreview();
  }

  async function loadOlderMessages() {
    if (
      loadingOlderRef.current ||
      !nextCursor ||
      !activeGroupId
    ) {
      return;
    }

    const groupIdAtRequest = activeGroupId;
    const container = messageListRef.current;

    if (!container) return;

    loadingOlderRef.current = true;

    const previousScrollHeight = container.scrollHeight;
    const previousScrollTop = container.scrollTop;

    try {
      const { data } = await groupService.getMessages(
        groupIdAtRequest,
        nextCursor
      );

      if (activeGroupIdRef.current !== groupIdAtRequest) {
        return;
      }

      setMessages((prev) =>
        mergeMessages(data.messages || [], prev)
      );

      setNextCursor(data.nextCursor || null);

      requestAnimationFrame(() => {
        const currentContainer = messageListRef.current;

        if (!currentContainer) return;

        currentContainer.scrollTop =
          currentContainer.scrollHeight -
          previousScrollHeight +
          previousScrollTop;
      });
    } catch (err) {
      console.error("Failed to load older messages:", err);
    } finally {
      loadingOlderRef.current = false;
    }
  }

  function handleScroll(e) {
    if (e.target.scrollTop < 80) {
      loadOlderMessages();
    }
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const element = messageListRef.current;

        if (!element) return;

        element.scrollTop = element.scrollHeight;
      });
    });
  }

  function sendMessage(e) {
    e.preventDefault();

    const text = draft.trim();
    const groupId = activeGroupIdRef.current;

    if (!text || !groupId || !socketRef.current) return;

    socketRef.current.emit(
      "message:send",
      { groupId, text },
      (ack) => {
        if (!ack?.ok) {
          console.error(
            "Failed to send message:",
            ack?.error
          );
        }
      }
    );

    setDraft("");

    socketRef.current.emit("typing:stop", {
      groupId,
    });

    // Do not force focus here. The mobile browser controls
    // keyboard visibility naturally.
  }

  const handleDraftChange = useCallback((value) => {
    setDraft(value);

    const groupId = activeGroupIdRef.current;

    if (!groupId || !socketRef.current) return;

    socketRef.current.emit("typing:start", {
      groupId,
    });

    clearTimeout(typingDebounceTimer);

    typingDebounceTimer = setTimeout(() => {
      if (!socketRef.current) return;

      socketRef.current.emit("typing:stop", {
        groupId,
      });
    }, 2000);
  }, []);

  function stageImageFile(file) {
    if (!file) return;

    const error = validateImageFile(file);

    if (error) {
      setImageError(error);
      return;
    }

    setImageError("");

    if (pendingImage?.previewUrl) {
      URL.revokeObjectURL(pendingImage.previewUrl);
    }

    setPendingImage({
      file,
      previewUrl: URL.createObjectURL(file),
    });
  }

  function handleFileInputChange(e) {
    stageImageFile(e.target.files?.[0]);
    e.target.value = "";
  }

  function handleComposerPaste(e) {
    const item = Array.from(
      e.clipboardData?.items || []
    ).find((item) =>
      item.type.startsWith("image/")
    );

    if (!item) return;

    e.preventDefault();
    stageImageFile(item.getAsFile());
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDraggingOver(false);

    const file = Array.from(
      e.dataTransfer.files || []
    ).find((file) =>
      file.type.startsWith("image/")
    );

    stageImageFile(file);
  }

  function cancelImagePreview() {
    if (pendingImage?.previewUrl) {
      URL.revokeObjectURL(pendingImage.previewUrl);
    }

    setPendingImage(null);
    setImageError("");
  }

  async function confirmSendImage() {
    const groupId = activeGroupIdRef.current;

    if (!pendingImage || !groupId) return;

    setSendingImage(true);

    try {
      await groupService.sendImage(
        groupId,
        pendingImage.file
      );

      cancelImagePreview();
      scrollToBottom();
    } catch (err) {
      setImageError(
        err.response?.data?.error ||
          "Failed to send image."
      );
    } finally {
      setSendingImage(false);
    }
  }

  const activeGroup = groups.find(
    (group) => group._id === activeGroupId
  );

  const typingNames = Object.values(typingUsers);

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-white">
      <header className="shrink-0 border-b border-slate-200 px-4 py-3 flex items-center justify-between bg-white">
        <h1 className="font-semibold text-slate-800">
          Group Chat
        </h1>

        <div className="flex items-center gap-3 text-sm">
          <span className="hidden sm:inline text-slate-500">
            {user.displayName || user.email}
          </span>

          {user.role === "SUPER_ADMIN" && (
            <Link
              to="/admin/users"
              className="text-slate-500 underline"
            >
              Admin
            </Link>
          )}

          <Link
            to="/notification-settings"
            className="text-slate-500 underline"
          >
            Notifications
          </Link>

          <button
            onClick={logout}
            className="text-slate-500 underline"
          >
            Log out
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <aside className="hidden sm:block w-64 shrink-0 border-r border-slate-200 bg-white overflow-y-auto">
          {groups.map((group) => (
            <button
              key={group._id}
              onClick={() => openGroup(group._id)}
              className={`w-full text-left px-4 py-3 border-b border-slate-100 flex justify-between items-center hover:bg-slate-50 ${
                group._id === activeGroupId
                  ? "bg-slate-100"
                  : ""
              }`}
            >
              <span className="truncate">
                {group.name}
              </span>

              {unreadCounts[group._id] > 0 && (
                <span className="ml-2 shrink-0 rounded-full bg-slate-800 text-white text-xs px-2 py-0.5">
                  {unreadCounts[group._id]}
                </span>
              )}
            </button>
          ))}

          {groups.length === 0 && (
            <p className="p-4 text-sm text-slate-400">
              No groups yet.
            </p>
          )}
        </aside>

        {!activeGroupId && (
          <div className="sm:hidden flex-1 min-h-0 overflow-y-auto bg-white">
            <div className="px-4 py-3 border-b border-slate-200">
              <h2 className="font-semibold text-slate-800">
                Your Groups
              </h2>
            </div>

            {groups.map((group) => (
              <button
                key={group._id}
                onClick={() => openGroup(group._id)}
                className="w-full flex items-center gap-3 px-4 py-3 border-b border-slate-100 active:bg-slate-100"
              >
                <div className="h-11 w-11 shrink-0 rounded-full bg-slate-800 text-white flex items-center justify-center font-semibold">
                  {group.name
                    ?.charAt(0)
                    ?.toUpperCase() || "G"}
                </div>

                <div className="min-w-0 flex-1 text-left">
                  <p className="font-medium text-slate-800 truncate">
                    {group.name}
                  </p>

                  <p className="text-xs text-slate-400 mt-0.5">
                    Tap to open chat
                  </p>
                </div>

                {unreadCounts[group._id] > 0 && (
                  <span className="min-w-6 h-6 px-2 rounded-full bg-slate-800 text-white text-xs flex items-center justify-center">
                    {unreadCounts[group._id]}
                  </span>
                )}
              </button>
            ))}

            {groups.length === 0 && (
              <div className="p-6 text-center text-sm text-slate-400">
                No groups yet.
              </div>
            )}
          </div>
        )}

        <main
          className={`${
            activeGroupId ? "flex" : "hidden sm:flex"
          } flex-1 min-w-0 min-h-0 flex-col relative overflow-hidden`}
          onDragOver={(e) => {
            e.preventDefault();

            if (activeGroupId) {
              setIsDraggingOver(true);
            }
          }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={
            activeGroupId ? handleDrop : undefined
          }
        >
          {isDraggingOver && (
            <div className="absolute inset-0 z-50 bg-slate-800/70 flex items-center justify-center text-white text-lg font-medium pointer-events-none">
              Drop image to share
            </div>
          )}

          {!activeGroupId ? (
            <div className="flex-1 hidden sm:flex items-center justify-center text-slate-400">
              Select a group to start chatting
            </div>
          ) : (
            <>
              <div className="shrink-0 border-b border-slate-200 px-3 sm:px-4 py-3 bg-white flex items-center gap-3">
                <button
                  type="button"
                  onClick={closeMobileChat}
                  className="sm:hidden h-9 w-9 rounded-full flex items-center justify-center text-slate-700 hover:bg-slate-100 active:bg-slate-200"
                  aria-label="Back to groups"
                >
                  ←
                </button>

                <div className="sm:hidden h-9 w-9 shrink-0 rounded-full bg-slate-800 text-white flex items-center justify-center text-sm font-semibold">
                  {activeGroup?.name
                    ?.charAt(0)
                    ?.toUpperCase() || "G"}
                </div>

                <div className="min-w-0">
                  <h2 className="font-medium text-slate-800 truncate">
                    {activeGroup?.name}
                  </h2>

                  <p className="text-xs text-slate-400">
                    {typingNames.length > 0
                      ? `${typingNames.join(", ")} ${
                          typingNames.length === 1
                            ? "is"
                            : "are"
                        } typing...`
                      : "Group chat"}
                  </p>
                </div>
              </div>

              <div
                ref={messageListRef}
                onScroll={handleScroll}
                className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-4 py-3 sm:py-4 bg-slate-50"
              >
                <div className="flex min-h-full flex-col justify-end gap-2">
                  {messages.map((message) => (
                    <MessageBubble
                      key={
                        getMessageId(message) ||
                        `${message.sender?.id || "unknown"}-${message.createdAt}-${message.text || message.image?.url || ""}`
                      }
                      message={message}
                      isOwn={
                        message.sender?.id === user.id
                      }
                    />
                  ))}
                </div>
              </div>

              {pendingImage && (
                <div className="shrink-0 border-t border-slate-200 p-3 bg-white flex items-center gap-3">
                  <img
                    src={pendingImage.previewUrl}
                    alt="Preview"
                    className="h-16 w-16 object-cover rounded-md border border-slate-200"
                  />

                  <div className="flex-1 min-w-0 text-sm text-slate-500">
                    {imageError ? (
                      <span className="text-red-600">
                        {imageError}
                      </span>
                    ) : (
                      "Ready to send this image?"
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={cancelImagePreview}
                    className="px-3 py-1.5 text-sm rounded-md border border-slate-300 hover:bg-slate-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={confirmSendImage}
                    disabled={
                      sendingImage ||
                      Boolean(imageError)
                    }
                    className="px-3 py-1.5 text-sm rounded-md bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    {sendingImage
                      ? "Sending..."
                      : "Send"}
                  </button>
                </div>
              )}

              <form
                onSubmit={sendMessage}
                className="shrink-0 border-t border-slate-200 p-2 sm:p-3 flex gap-2 bg-white"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleFileInputChange}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() =>
                    fileInputRef.current?.click()
                  }
                  title="Attach image"
                  className="shrink-0 rounded-full sm:rounded-md border border-slate-300 h-10 w-10 sm:h-auto sm:w-auto sm:px-3 sm:py-2 text-slate-600 hover:bg-slate-50 flex items-center justify-center"
                >
                  📎
                </button>

                <input
                  value={draft}
                  onChange={(e) =>
                    handleDraftChange(e.target.value)
                  }
                  onPaste={handleComposerPaste}
                  placeholder="Type a message..."
                  autoComplete="off"
                  className="min-w-0 flex-1 rounded-full sm:rounded-md border border-slate-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-slate-500"
                />

                <button
                  type="submit"
                  onPointerDown={(e) => e.preventDefault()}
                  className="shrink-0 rounded-full sm:rounded-md bg-slate-800 px-4 py-2.5 text-white font-medium hover:bg-slate-700 active:bg-slate-900"
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
  const senderName =
    message.sender?.displayName ||
    "Unknown User";

  return (
    <div
      className={`flex ${
        isOwn ? "justify-end" : "justify-start"
      }`}
    >
      <div
        className={`max-w-[82%] sm:max-w-md rounded-2xl px-3 py-2 ${
          isOwn
            ? "bg-slate-800 text-white rounded-br-md"
            : "bg-white border border-slate-200 text-slate-800 rounded-bl-md"
        }`}
      >
        {!isOwn && (
          <p className="text-xs font-medium text-slate-500 mb-0.5">
            {senderName}
          </p>
        )}

        {message.type === "IMAGE" ? (
          message.image?.url ? (
            <img
              src={message.image.url}
              alt="Shared"
              className="max-w-full rounded-lg"
              style={{ maxHeight: 260 }}
            />
          ) : (
            <p className="text-sm">
              Image unavailable
            </p>
          )
        ) : (
          <p className="text-sm whitespace-pre-wrap break-words">
            {message.text}
          </p>
        )}

        <p
          className={`text-[10px] mt-1 text-right ${
            isOwn
              ? "text-slate-300"
              : "text-slate-400"
          }`}
        >
          {message.createdAt
            ? new Date(
                message.createdAt
              ).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : ""}
        </p>
      </div>
    </div>
  );
}
