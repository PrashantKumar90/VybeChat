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
  const messageInputRef = useRef(null);
  const activeGroupIdRef = useRef(null);

  // --------------------------------------------------
  // Initial load
  // --------------------------------------------------

  useEffect(() => {
    groupService.listGroups().then(({ data }) => {
      setGroups(data.groups || []);
    });

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

  useEffect(() => {
    activeGroupIdRef.current = activeGroupId;
  }, [activeGroupId]);

  function refreshUnreadCounts() {
    groupService.listUnreadCounts().then(({ data }) => {
      const map = {};

      (data.counts || []).forEach((c) => {
        map[c.groupId] = c.unreadCount;
      });

      setUnreadCounts(map);
    });
  }

  // --------------------------------------------------
  // Incoming messages
  // --------------------------------------------------

  function handleIncomingMessage(payload) {
    setMessages((prev) => {
      if (payload.groupId !== activeGroupIdRef.current) {
        return prev;
      }

      return [...prev, payload];
    });

    if (payload.groupId !== activeGroupIdRef.current) {
      refreshUnreadCounts();
    } else {
      scrollToBottom();
    }
  }

  // --------------------------------------------------
  // Typing indicator
  // --------------------------------------------------

  function handleTypingUpdate({
    groupId,
    userId,
    displayName,
    isTyping,
  }) {
    if (groupId !== activeGroupIdRef.current) return;

    setTypingUsers((prev) => {
      const next = { ...prev };

      if (isTyping) {
        next[userId] = displayName;
      } else {
        delete next[userId];
      }

      return next;
    });
  }

  // --------------------------------------------------
  // Open group
  // --------------------------------------------------

  async function openGroup(groupId) {
    if (activeGroupId && socketRef.current) {
      socketRef.current.emit("group:leave", {
        groupId: activeGroupId,
      });
    }

    setActiveGroupId(groupId);
    setMessages([]);
    setTypingUsers({});
    setNextCursor(null);
    setDraft("");
    cancelImagePreview();

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

    const { data } = await groupService.getMessages(groupId);

    setMessages(data.messages || []);
    setNextCursor(data.nextCursor);

    await groupService.markRead(groupId);

    setUnreadCounts((prev) => ({
      ...prev,
      [groupId]: 0,
    }));

    requestAnimationFrame(() => {
      scrollToBottom();
    });

    // On mobile, automatically focus the composer.
    // A browser may still decide not to open the keyboard
    // unless this action originated from a user gesture.
    setTimeout(() => {
      messageInputRef.current?.focus();
    }, 100);
  }

  // --------------------------------------------------
  // Mobile back to group list
  // --------------------------------------------------

  function backToGroups() {
    if (activeGroupId && socketRef.current) {
      socketRef.current.emit("group:leave", {
        groupId: activeGroupId,
      });
    }

    setActiveGroupId(null);
    setMessages([]);
    setTypingUsers({});
    setNextCursor(null);
    setDraft("");

    cancelImagePreview();
  }

  // --------------------------------------------------
  // Older messages
  // --------------------------------------------------

  async function loadOlderMessages() {
    if (!nextCursor || !activeGroupId) return;

    const container = messageListRef.current;
    const prevScrollHeight = container?.scrollHeight || 0;

    const { data } = await groupService.getMessages(
      activeGroupId,
      nextCursor
    );

    setMessages((prev) => [
      ...(data.messages || []),
      ...prev,
    ]);

    setNextCursor(data.nextCursor);

    requestAnimationFrame(() => {
      if (container) {
        container.scrollTop =
          container.scrollHeight - prevScrollHeight;
      }
    });
  }

  function handleScroll(e) {
    if (e.target.scrollTop < 80) {
      loadOlderMessages();
    }
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      const el = messageListRef.current;

      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }

  // --------------------------------------------------
  // Send text message
  // --------------------------------------------------

  function sendMessage(e) {
    e.preventDefault();

    const text = draft.trim();

    if (!text || !activeGroupId) {
      // Keep the input focused even if there is nothing to send.
      messageInputRef.current?.focus();
      return;
    }

    const groupId = activeGroupId;

    socketRef.current.emit(
      "message:send",
      {
        groupId,
        text,
      },
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

    /*
     * Important for mobile:
     *
     * Keep the message input focused after sending.
     * This prevents our React UI from intentionally
     * removing focus from the input.
     */
    requestAnimationFrame(() => {
      messageInputRef.current?.focus();
    });
  }

  // --------------------------------------------------
  // Draft / typing
  // --------------------------------------------------

  const handleDraftChange = useCallback(
    (value) => {
      setDraft(value);

      if (!activeGroupId) return;

      socketRef.current.emit("typing:start", {
        groupId: activeGroupId,
      });

      clearTimeout(typingDebounceTimer);

      typingDebounceTimer = setTimeout(() => {
        socketRef.current.emit("typing:stop", {
          groupId: activeGroupId,
        });
      }, 2000);
    },
    [activeGroupId]
  );

  // --------------------------------------------------
  // Image sharing
  // --------------------------------------------------

  function stageImageFile(file) {
    if (!file) return;

    const error = validateImageFile(file);

    if (error) {
      setImageError(error);
      return;
    }

    setImageError("");

    setPendingImage({
      file,
      previewUrl: URL.createObjectURL(file),
    });
  }

  function handleFileInputChange(e) {
    stageImageFile(e.target.files?.[0]);

    // Allow selecting the same file again.
    e.target.value = "";
  }

  function handleComposerPaste(e) {
    const item = Array.from(
      e.clipboardData?.items || []
    ).find((i) => i.type.startsWith("image/"));

    if (item) {
      e.preventDefault();
      stageImageFile(item.getAsFile());
    }
  }

  function handleDrop(e) {
    e.preventDefault();

    setIsDraggingOver(false);

    const file = Array.from(
      e.dataTransfer.files || []
    ).find((f) => f.type.startsWith("image/"));

    stageImageFile(file);
  }

  function cancelImagePreview() {
    if (pendingImage?.previewUrl) {
      URL.revokeObjectURL(
        pendingImage.previewUrl
      );
    }

    setPendingImage(null);
    setImageError("");
  }

  async function confirmSendImage() {
    if (!pendingImage || !activeGroupId) return;

    setSendingImage(true);

    try {
      await groupService.sendImage(
        activeGroupId,
        pendingImage.file
      );

      cancelImagePreview();

      // Keep composer focused on mobile.
      requestAnimationFrame(() => {
        messageInputRef.current?.focus();
      });
    } catch (err) {
      setImageError(
        err.response?.data?.error ||
          "Failed to send image."
      );
    } finally {
      setSendingImage(false);
    }
  }

  // --------------------------------------------------
  // Derived values
  // --------------------------------------------------

  const activeGroup = groups.find(
    (g) => g._id === activeGroupId
  );

  const typingNames = Object.values(typingUsers);

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-slate-50">

      {/* ==================================================
          DESKTOP / MOBILE TOP HEADER
          ================================================== */}

      {!activeGroupId ? (
        <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center justify-between">

            <div>
              <h1 className="text-lg font-bold text-slate-800">
                VYBE
              </h1>

              <p className="text-xs text-slate-400">
                Your Groups
              </p>
            </div>

            <div className="flex items-center gap-3 text-sm">
              <span className="hidden sm:inline text-slate-500">
                {user.displayName || user.email}
              </span>

              {user.role === "SUPER_ADMIN" && (
                <Link
                  to="/admin/users"
                  className="hidden sm:inline text-slate-500 hover:text-slate-800"
                >
                  Admin
                </Link>
              )}

              <Link
                to="/notification-settings"
                className="hidden sm:inline text-slate-500 hover:text-slate-800"
              >
                Notifications
              </Link>

              <button
                onClick={logout}
                className="text-slate-500 hover:text-slate-800"
              >
                Log out
              </button>
            </div>

          </div>
        </header>
      ) : (
        <header className="sm:hidden shrink-0 border-b border-slate-200 bg-white px-3 py-2">
          <div className="flex items-center gap-3">

            <button
              type="button"
              onClick={backToGroups}
              className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-slate-700 hover:bg-slate-100 active:bg-slate-200"
              aria-label="Back to groups"
            >
              <span className="text-2xl leading-none">
                ‹
              </span>
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="truncate font-semibold text-slate-800">
                {activeGroup?.name || "Chat"}
              </h1>

              <p className="text-xs text-slate-400">
                Group
              </p>
            </div>

          </div>
        </header>
      )}

      {/* ==================================================
          MAIN CONTENT
          ================================================== */}

      <div className="flex flex-1 min-h-0">

        {/* ==================================================
            DESKTOP GROUP SIDEBAR
            ================================================== */}

        <aside className="hidden sm:block w-64 shrink-0 border-r border-slate-200 bg-white overflow-y-auto">

          <div className="sticky top-0 bg-white border-b border-slate-100 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Groups
            </p>
          </div>

          {groups.map((g) => (
            <button
              key={g._id}
              onClick={() => openGroup(g._id)}
              className={`w-full text-left px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3 transition ${
                g._id === activeGroupId
                  ? "bg-slate-100"
                  : "hover:bg-slate-50"
              }`}
            >
              <span className="truncate text-sm font-medium text-slate-700">
                {g.name}
              </span>

              {unreadCounts[g._id] > 0 && (
                <span className="ml-2 shrink-0 min-w-6 h-6 rounded-full bg-slate-800 text-white text-xs flex items-center justify-center px-2">
                  {unreadCounts[g._id]}
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

        {/* ==================================================
            MOBILE GROUP LIST
            ================================================== */}

        {!activeGroupId && (
          <div className="sm:hidden flex-1 overflow-y-auto bg-slate-50">

            <div className="px-3 pt-3 pb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Your Groups
              </p>
            </div>

            <div className="px-2 pb-4">
              {groups.map((g) => (
                <button
                  key={g._id}
                  type="button"
                  onClick={() => openGroup(g._id)}
                  className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-left hover:bg-white active:bg-white transition"
                >

                  {/* Group avatar */}
                  <div className="h-12 w-12 shrink-0 rounded-full bg-slate-800 text-white flex items-center justify-center font-semibold text-lg">
                    {(g.name || "G")
                      .charAt(0)
                      .toUpperCase()}
                  </div>

                  {/* Group details */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">

                      <span className="truncate font-semibold text-slate-800">
                        {g.name}
                      </span>

                      {unreadCounts[g._id] > 0 && (
                        <span className="shrink-0 min-w-6 h-6 rounded-full bg-slate-800 text-white text-xs flex items-center justify-center px-2">
                          {unreadCounts[g._id]}
                        </span>
                      )}

                    </div>

                    <p className="mt-0.5 text-xs text-slate-400">
                      Tap to open chat
                    </p>
                  </div>

                  <span className="text-slate-300 text-xl">
                    ›
                  </span>

                </button>
              ))}

              {groups.length === 0 && (
                <div className="px-4 py-12 text-center">
                  <div className="mx-auto mb-3 h-14 w-14 rounded-full bg-white flex items-center justify-center text-slate-300 text-2xl">
                    #
                  </div>

                  <p className="text-sm text-slate-400">
                    You are not a member of any group yet.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================================================
            CHAT AREA
            ================================================== */}

        <main
          className={`flex-1 min-w-0 flex flex-col min-h-0 relative ${
            !activeGroupId
              ? "hidden sm:flex"
              : "flex"
          }`}
          onDragOver={(e) => {
            e.preventDefault();

            if (activeGroupId) {
              setIsDraggingOver(true);
            }
          }}
          onDragLeave={() => {
            setIsDraggingOver(false);
          }}
          onDrop={
            activeGroupId
              ? handleDrop
              : undefined
          }
        >

          {/* Drag overlay */}
          {isDraggingOver && (
            <div className="absolute inset-0 z-50 bg-slate-800/80 flex items-center justify-center text-white text-lg font-medium pointer-events-none">
              Drop image to share
            </div>
          )}

          {!activeGroupId ? (
            <div className="flex-1 hidden sm:flex items-center justify-center text-slate-400">
              Select a group to start chatting
            </div>
          ) : (
            <>
              {/* ==================================================
                  DESKTOP CHAT HEADER
                  ================================================== */}

              <div className="hidden sm:block shrink-0 border-b border-slate-200 px-4 py-3 bg-white">
                <h2 className="font-semibold text-slate-800">
                  {activeGroup?.name}
                </h2>

                <p className="text-xs text-slate-400 mt-0.5">
                  Group chat
                </p>
              </div>

              {/* ==================================================
                  MESSAGES
                  ================================================== */}

              <div
                ref={messageListRef}
                onScroll={handleScroll}
                className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-4 py-3 sm:py-4 space-y-2 bg-slate-50"
              >
                {messages.length === 0 && (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center text-slate-400">
                      <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-white flex items-center justify-center text-slate-300">
                        #
                      </div>

                      <p className="text-sm">
                        No messages yet.
                      </p>

                      <p className="text-xs mt-1">
                        Start the conversation.
                      </p>
                    </div>
                  </div>
                )}

                {messages.map((m) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    isOwn={
                      m.sender.id === user.id
                    }
                  />
                ))}
              </div>

              {/* ==================================================
                  TYPING INDICATOR
                  ================================================== */}

              {typingNames.length > 0 && (
                <div className="shrink-0 px-4 py-1.5 text-xs text-slate-400 italic bg-slate-50">
                  {typingNames.join(", ")}{" "}
                  {typingNames.length === 1
                    ? "is"
                    : "are"}{" "}
                  typing...
                </div>
              )}

              {/* ==================================================
                  IMAGE PREVIEW
                  ================================================== */}

              {pendingImage && (
                <div className="shrink-0 border-t border-slate-200 px-3 py-2.5 bg-white">

                  <div className="flex items-center gap-3">

                    <img
                      src={
                        pendingImage.previewUrl
                      }
                      alt="Preview"
                      className="h-16 w-16 shrink-0 object-cover rounded-lg border border-slate-200"
                    />

                    <div className="flex-1 min-w-0 text-sm">
                      {imageError ? (
                        <span className="text-red-600">
                          {imageError}
                        </span>
                      ) : (
                        <span className="text-slate-500">
                          Ready to send this image?
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={cancelImagePreview}
                      className="shrink-0 px-3 py-2 text-sm rounded-lg border border-slate-300 hover:bg-slate-50 active:bg-slate-100"
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
                      className="shrink-0 px-3 py-2 text-sm rounded-lg bg-slate-800 text-white hover:bg-slate-700 active:bg-slate-900 disabled:opacity-50"
                    >
                      {sendingImage
                        ? "Sending..."
                        : "Send"}
                    </button>

                  </div>
                </div>
              )}

              {/* ==================================================
                  MESSAGE COMPOSER
                  ================================================== */}

              <div className="shrink-0 border-t border-slate-200 bg-white px-2 sm:px-3 py-2 sm:py-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">

                <form
                  onSubmit={sendMessage}
                  className="flex items-end gap-2"
                >

                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleFileInputChange}
                    className="hidden"
                  />

                  {/* Attachment */}
                  <button
                    type="button"
                    onClick={() =>
                      fileInputRef.current?.click()
                    }
                    title="Attach image"
                    aria-label="Attach image"
                    className="h-11 w-11 shrink-0 rounded-full border border-slate-300 flex items-center justify-center text-slate-600 hover:bg-slate-50 active:bg-slate-100"
                  >
                    <span className="text-lg">
                      📎
                    </span>
                  </button>

                  {/* Text input */}
                  <input
                    ref={messageInputRef}
                    value={draft}
                    onChange={(e) =>
                      handleDraftChange(
                        e.target.value
                      )
                    }
                    onPaste={handleComposerPaste}
                    placeholder="Type a message..."
                    autoComplete="off"
                    enterKeyHint="send"
                    className="min-w-0 flex-1 h-11 rounded-full border border-slate-300 bg-slate-50 px-4 text-sm text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />

                  {/* Send */}
                  <button
                    type="submit"
                    aria-label="Send message"
                    className="h-11 min-w-11 px-4 shrink-0 rounded-full bg-slate-800 text-white font-medium hover:bg-slate-700 active:bg-slate-900"
                  >
                    <span className="hidden sm:inline">
                      Send
                    </span>

                    <span className="sm:hidden text-lg">
                      ➤
                    </span>
                  </button>

                </form>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// ======================================================
// Message Bubble
// ======================================================

function MessageBubble({
  message,
  isOwn,
}) {
  return (
    <div
      className={`flex ${
        isOwn
          ? "justify-end"
          : "justify-start"
      }`}
    >
      <div
        className={`max-w-[82%] sm:max-w-md rounded-2xl px-3 py-2 shadow-sm ${
          isOwn
            ? "bg-slate-800 text-white rounded-br-md"
            : "bg-white border border-slate-200 text-slate-800 rounded-bl-md"
        }`}
      >

        {!isOwn && (
          <p className="text-xs font-semibold text-slate-500 mb-0.5">
            {message.sender.displayName}
          </p>
        )}

        {message.type === "IMAGE" ? (
          <img
            src={message.image.url}
            alt="Shared"
            className="max-w-full w-auto rounded-xl object-contain"
            style={{
              maxHeight: 320,
            }}
          />
        ) : (
          <p className="text-sm leading-5 whitespace-pre-wrap break-words">
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
          {new Date(
            message.createdAt
          ).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>

      </div>
    </div>
  );
}