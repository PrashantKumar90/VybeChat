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

  const [showProfile, setShowProfile] = useState(false);

  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("vybechat-theme") || "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("vybechat-theme", theme);
      document.documentElement.dataset.theme = theme;
    } catch {
      // Ignore storage errors.
    }
  }, [theme]);

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

  useEffect(() => {
    return () => {
      clearTimeout(typingDebounceTimer);
    };
  }, []);

  // --------------------------------------------------
  // Unread counts
  // --------------------------------------------------

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
    if (payload.groupId !== activeGroupIdRef.current) {
      refreshUnreadCounts();
      return;
    }

    setMessages((prev) => [...prev, payload]);

    // Always move to the newest message for the active chat.
    scrollToBottom();
  }

  // --------------------------------------------------
  // Typing
  // --------------------------------------------------

  function handleTypingUpdate(payload = {}) {
    const {
      groupId,
      userId,
      displayName,
      isTyping,
      user,
    } = payload;

    if (groupId !== activeGroupIdRef.current) return;

    const senderId =
      userId ||
      user?.id ||
      user?._id ||
      null;

    const senderName =
      displayName ||
      user?.displayName ||
      "Someone";

    // Never show our own typing state.
    if (
      senderId &&
      user?.id &&
      String(senderId) === String(user.id)
    ) {
      return;
    }

    setTypingUsers((prev) => {
      const next = { ...prev };

      if (isTyping && senderId) {
        next[String(senderId)] = senderName;
      } else if (senderId) {
        delete next[String(senderId)];
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

    clearTimeout(typingDebounceTimer);
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

    const { data } =
      await groupService.getMessages(groupId);

    setMessages(data.messages || []);
    setNextCursor(data.nextCursor);

    await groupService.markRead(groupId);

    setUnreadCounts((prev) => ({
      ...prev,
      [groupId]: 0,
    }));

    // Wait for messages to render, then go to bottom.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToBottom();
      });
    });
  }

  // --------------------------------------------------
  // Mobile back
  // --------------------------------------------------

  function backToGroups() {
    if (activeGroupId && socketRef.current) {
      socketRef.current.emit("group:leave", {
        groupId: activeGroupId,
      });
    }

    clearTimeout(typingDebounceTimer);
    setActiveGroupId(null);
    setMessages([]);
    setTypingUsers({});
    setNextCursor(null);
    setDraft("");

    cancelImagePreview();
  }

  // --------------------------------------------------
  // Load older messages
  // --------------------------------------------------

  async function loadOlderMessages() {
    if (!nextCursor || !activeGroupId) return;

    const container = messageListRef.current;

    const previousScrollHeight =
      container?.scrollHeight || 0;

    const previousScrollTop =
      container?.scrollTop || 0;

    const { data } =
      await groupService.getMessages(
        activeGroupId,
        nextCursor
      );

    setMessages((prev) => [
      ...(data.messages || []),
      ...prev,
    ]);

    setNextCursor(data.nextCursor);

    // Preserve the user's position after adding older messages.
    requestAnimationFrame(() => {
      if (!container) return;

      const newScrollHeight =
        container.scrollHeight;

      container.scrollTop =
        newScrollHeight -
        previousScrollHeight +
        previousScrollTop;
    });
  }

  function handleScroll(e) {
    if (e.target.scrollTop < 80) {
      loadOlderMessages();
    }
  }

  // --------------------------------------------------
  // Scroll to latest message
  // --------------------------------------------------

  function scrollToBottom() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const element = messageListRef.current;

        if (!element) return;

        element.scrollTop =
          element.scrollHeight;
      });
    });
  }

  // --------------------------------------------------
  // Send text message
  // --------------------------------------------------

  function sendMessage(e) {
    e.preventDefault();

    const text = draft.trim();

    if (!text || !activeGroupId) {
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
    clearTimeout(typingDebounceTimer);

    socketRef.current.emit(
      "typing:stop",
      {
        groupId,
      }
    );

    /*
     * Keep input focused after sending.
     * This prevents our code from closing
     * the mobile keyboard.
     */
    requestAnimationFrame(() => {
      messageInputRef.current?.focus();
    });
  }

  // --------------------------------------------------
  // Typing input
  // --------------------------------------------------

  const handleDraftChange = useCallback(
    (value) => {
      setDraft(value);

      const groupId = activeGroupIdRef.current;
      const socket = socketRef.current;

      if (!groupId || !socket) return;

      clearTimeout(typingDebounceTimer);

      if (!value.trim()) {
        socket.emit("typing:stop", { groupId });
        return;
      }

      socket.emit("typing:start", { groupId });

      typingDebounceTimer = setTimeout(() => {
        if (activeGroupIdRef.current !== groupId) return;

        socketRef.current?.emit("typing:stop", {
          groupId,
        });
      }, 2000);
    },
    []
  );

  // --------------------------------------------------
  // Image sharing
  // --------------------------------------------------

  function stageImageFile(file) {
    if (!file) return;

    const error =
      validateImageFile(file);

    if (error) {
      setImageError(error);
      return;
    }

    setImageError("");

    setPendingImage({
      file,
      previewUrl:
        URL.createObjectURL(file),
    });
  }

  function handleFileInputChange(e) {
    stageImageFile(
      e.target.files?.[0]
    );

    e.target.value = "";
  }

  function handleComposerPaste(e) {
    const item = Array.from(
      e.clipboardData?.items || []
    ).find((i) =>
      i.type.startsWith("image/")
    );

    if (item) {
      e.preventDefault();

      stageImageFile(
        item.getAsFile()
      );
    }
  }

  function handleDrop(e) {
    e.preventDefault();

    setIsDraggingOver(false);

    const file = Array.from(
      e.dataTransfer.files || []
    ).find((f) =>
      f.type.startsWith("image/")
    );

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
    if (
      !pendingImage ||
      !activeGroupId
    ) {
      return;
    }

    setSendingImage(true);

    try {
      await groupService.sendImage(
        activeGroupId,
        pendingImage.file
      );

      cancelImagePreview();

      requestAnimationFrame(() => {
        messageInputRef.current?.focus();
        scrollToBottom();
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

  const activeGroup =
    groups.find(
      (g) =>
        g._id === activeGroupId
    );

  const typingNames =
    Object.values(typingUsers);

  // --------------------------------------------------
  // Profile screen
  // --------------------------------------------------

  function openProfile() {
    setShowProfile(true);
    setActiveGroupId(null);
  }

  function closeProfile() {
    setShowProfile(false);
  }

  // --------------------------------------------------
  // UI
  // --------------------------------------------------

  const isDark = theme === "dark";

  const pageClass = isDark
    ? "h-[100dvh] flex flex-col overflow-hidden bg-[#0b141a] text-slate-100"
    : "h-[100dvh] flex flex-col overflow-hidden bg-[#f7f9fa] text-slate-800";

  const panelClass = isDark
    ? "bg-[#111b21] border-slate-700"
    : "bg-white border-slate-200";

  const subtleTextClass = isDark
    ? "text-slate-400"
    : "text-slate-400";

  const chatBackgroundStyle = {
    backgroundColor: isDark ? "#0b141a" : "#efeae2",
    backgroundImage: isDark
      ? "radial-gradient(circle at 20% 20%, rgba(42,57,66,0.22) 0 1px, transparent 1px), radial-gradient(circle at 80% 70%, rgba(42,57,66,0.18) 0 1px, transparent 1px)"
      : "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.55) 0 1px, transparent 1px), radial-gradient(circle at 80% 70%, rgba(160,140,120,0.12) 0 1px, transparent 1px)",
    backgroundSize: "28px 28px, 34px 34px",
  };


  if (showProfile) {
    return (
      <ProfileView
        user={user}
        theme={theme}
        setTheme={setTheme}
        onBack={closeProfile}
        logout={logout}
      />
    );
  }

  return (
    <div className={pageClass}>

      {/* ==================================================
          GROUP LIST HEADER
          ================================================== */}

      {!activeGroupId && (
        <header className={`shrink-0 border-b px-4 py-3 ${panelClass}`}>

          <div className="flex items-center justify-between">

            <div>
              <h1 className="text-lg font-bold text-slate-800">
                VYBE
              </h1>

              <p className="text-xs text-slate-400">
                Your Groups
              </p>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 text-sm">

              <span className="hidden lg:inline text-slate-500 truncate max-w-48">
                {user.displayName || user.email}
              </span>

              {user.role === "SUPER_ADMIN" && (
                <Link
                  to="/admin/users"
                  className="hidden sm:inline-flex h-9 items-center rounded-full px-3 text-slate-600 hover:bg-slate-100"
                >
                  Admin
                </Link>
              )}

              <Link
                to="/notification-settings"
                className="inline-flex h-9 items-center rounded-full px-3 text-slate-600 hover:bg-slate-100"
                title="Notification settings"
              >
                <span className="sm:hidden">Notifications</span>
                <span className="hidden sm:inline">Notifications</span>
              </Link>

              <button
                type="button"
                onClick={openProfile}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-slate-700 shadow-sm hover:bg-slate-50"
                title="Profile"
              >
                <span className="h-6 w-6 rounded-full bg-slate-800 text-white flex items-center justify-center text-[11px] font-semibold">
                  {(user.displayName || user.email || "U").charAt(0).toUpperCase()}
                </span>
                <span className="hidden sm:inline font-medium">Profile</span>
              </button>

            </div>

          </div>
        </header>
      )}

      {/* ==================================================
          MOBILE CHAT HEADER
          ================================================== */}

      {activeGroupId && (
        <header className={`sm:hidden shrink-0 border-b px-3 py-2 ${panelClass}`}>

          <div className="flex items-center gap-3">

            <button
              type="button"
              onClick={backToGroups}
              className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center ${
                isDark
                  ? "text-slate-200 hover:bg-slate-800 active:bg-slate-700"
                  : "text-slate-700 hover:bg-slate-100 active:bg-slate-200"
              }`}
              aria-label="Back to groups"
            >
              <span className="text-3xl leading-none">
                ‹
              </span>
            </button>

            <div className="min-w-0 flex-1">

              <h1 className={`truncate font-semibold ${isDark ? "text-slate-100" : "text-slate-800"}`}>
                {activeGroup?.name ||
                  "Chat"}
              </h1>

              <p className={`truncate text-xs ${subtleTextClass}`}>
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



        </header>
      )}

      {/* ==================================================
          MAIN
          ================================================== */}

      <div className="flex flex-1 min-h-0">

        {/* ==================================================
            DESKTOP GROUP SIDEBAR
            ================================================== */}

        <aside className={`hidden sm:block w-64 shrink-0 border-r overflow-y-auto ${panelClass}`}>

          <div className={`sticky top-0 border-b px-4 py-3 ${panelClass}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Groups
            </p>
          </div>

          {groups.map((g) => (
            <button
              key={g._id}
              onClick={() =>
                openGroup(g._id)
              }
              className={`w-full text-left px-4 py-3 border-b flex items-center justify-between gap-3 transition ${
                isDark ? "border-slate-800" : "border-slate-100"
              } ${
                g._id === activeGroupId
                  ? isDark
                    ? "bg-slate-800"
                    : "bg-slate-100"
                  : isDark
                    ? "hover:bg-slate-800/70"
                    : "hover:bg-slate-50"
              }`}
            >

              <span className={`truncate text-sm font-medium ${isDark ? "text-slate-200" : "text-slate-700"}`}>
                {g.name}
              </span>

              {unreadCounts[
                g._id
              ] > 0 && (
                <span className="ml-2 shrink-0 min-w-6 h-6 rounded-full bg-slate-800 text-white text-xs flex items-center justify-center px-2">
                  {
                    unreadCounts[
                      g._id
                    ]
                  }
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
          <div className={`sm:hidden flex-1 overflow-y-auto ${isDark ? "bg-[#0b141a]" : "bg-[#f7f9fa]"}`}>

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
                  onClick={() =>
                    openGroup(g._id)
                  }
                  className={`w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-left transition ${
                    isDark
                      ? "hover:bg-[#111b21] active:bg-[#111b21]"
                      : "hover:bg-white active:bg-white"
                  }`}
                >

                  <div className={`h-12 w-12 shrink-0 rounded-full flex items-center justify-center font-semibold text-lg ${
                    isDark
                      ? "bg-slate-700 text-slate-100"
                      : "bg-slate-800 text-white"
                  }`}>
                    {(g.name || "G")
                      .charAt(0)
                      .toUpperCase()}
                  </div>

                  <div className="min-w-0 flex-1">

                    <div className="flex items-center justify-between gap-2">

                      <span className={`truncate font-semibold ${isDark ? "text-slate-100" : "text-slate-800"}`}>
                        {g.name}
                      </span>

                      {unreadCounts[
                        g._id
                      ] > 0 && (
                        <span className="shrink-0 min-w-6 h-6 rounded-full bg-slate-800 text-white text-xs flex items-center justify-center px-2">
                          {
                            unreadCounts[
                              g._id
                            ]
                          }
                        </span>
                      )}

                    </div>

                    <p className="mt-0.5 text-xs text-slate-400">
                      Tap to open chat
                    </p>

                  </div>

                  <span className={`text-xl ${isDark ? "text-slate-600" : "text-slate-300"}`}>
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
                    You are not a member
                    of any group yet.
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
          onDragLeave={() =>
            setIsDraggingOver(false)
          }
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

              <div className={`hidden sm:block shrink-0 border-b px-4 py-3 ${panelClass}`}>

                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className={`truncate font-semibold ${isDark ? "text-slate-100" : "text-slate-800"}`}>
                      {activeGroup?.name}
                    </h2>

                    <p className={`truncate text-xs mt-0.5 ${subtleTextClass}`}>
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

              </div>

              {/* ==================================================
                  MESSAGE LIST
                  ================================================== */}

              <div
                ref={messageListRef}
                onScroll={handleScroll}
                className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-4 py-3 sm:py-4"
                style={chatBackgroundStyle}
              >

                {/* IMPORTANT:
                    This makes messages sit at the bottom
                    when there are only a few messages,
                    just like WhatsApp. */}

                <div className="flex min-h-full flex-col justify-end gap-2">

                  {messages.length === 0 && (
                    <div className="flex-1 flex items-center justify-center">

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
                        m.sender.id ===
                        user.id
                      }
                      isDark={isDark}
                    />
                  ))}

                </div>
              </div>

              {/* ==================================================
                  TYPING
                  ================================================== */}

              {typingNames.length > 0 && (
                <div className={`shrink-0 px-4 py-1.5 text-xs italic ${
                  isDark
                    ? "text-slate-400 bg-[#111b21]"
                    : "text-slate-400 bg-[#efeae2]"
                }`}>
                  {typingNames.join(
                    ", "
                  )}{" "}
                  {typingNames.length ===
                  1
                    ? "is"
                    : "are"}{" "}
                  typing...
                </div>
              )}

              {/* ==================================================
                  IMAGE PREVIEW
                  ================================================== */}

              {pendingImage && (
                <div className={`shrink-0 border-t px-3 py-2.5 ${panelClass}`}>

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
                          Ready to send this
                          image?
                        </span>
                      )}

                    </div>

                    <button
                      type="button"
                      onClick={
                        cancelImagePreview
                      }
                      className="shrink-0 px-3 py-2 text-sm rounded-lg border border-slate-300 hover:bg-slate-50 active:bg-slate-100"
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      onClick={
                        confirmSendImage
                      }
                      disabled={
                        sendingImage ||
                        Boolean(
                          imageError
                        )
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

              <div className={`shrink-0 border-t px-2 sm:px-3 py-2 sm:py-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] ${panelClass}`}>

                <form
                  onSubmit={sendMessage}
                  className="flex items-end gap-2"
                >

                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={
                      handleFileInputChange
                    }
                    className="hidden"
                  />

                  {/* Attach */}
                  <button
                    type="button"
                    onClick={() =>
                      fileInputRef.current?.click()
                    }
                    title="Attach image"
                    aria-label="Attach image"
                    className={`h-11 w-11 shrink-0 rounded-full border flex items-center justify-center ${
                      isDark
                        ? "border-slate-600 text-slate-300 hover:bg-slate-800 active:bg-slate-700"
                        : "border-slate-300 text-slate-600 hover:bg-slate-50 active:bg-slate-100"
                    }`}
                  >
                    <span className="text-lg">
                      📎
                    </span>
                  </button>

                  {/* Message input */}
                  <input
                    ref={messageInputRef}
                    value={draft}
                    onChange={(e) =>
                      handleDraftChange(
                        e.target.value
                      )
                    }
                    onPaste={
                      handleComposerPaste
                    }
                    placeholder="Type a message..."
                    autoComplete="off"
                    enterKeyHint="send"
                    className={`min-w-0 flex-1 h-11 rounded-full border px-4 text-sm focus:outline-none focus:ring-2 ${
                      isDark
                        ? "border-slate-600 bg-[#202c33] text-slate-100 placeholder:text-slate-500 focus:bg-[#202c33] focus:ring-slate-600"
                        : "border-slate-300 bg-slate-50 text-slate-800 placeholder:text-slate-400 focus:bg-white focus:ring-slate-400"
                    }`}
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
// Profile View
// ======================================================

function ProfileView({ user, theme, setTheme, onBack, logout }) {
  const isDark = theme === "dark";
  const initial = (user?.displayName || user?.email || "U").charAt(0).toUpperCase();

  return (
    <div className={`min-h-[100dvh] ${isDark ? "bg-[#0b141a] text-slate-100" : "bg-[#f7f9fa] text-slate-800"}`}>
      <header className={`border-b px-4 py-3 ${isDark ? "bg-[#111b21] border-slate-700" : "bg-white border-slate-200"}`}>
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button type="button" onClick={onBack} className={`h-10 w-10 rounded-full text-2xl ${isDark ? "hover:bg-slate-800" : "hover:bg-slate-100"}`} aria-label="Back">‹</button>
          <div>
            <h1 className="font-semibold">Profile</h1>
            <p className="text-xs text-slate-400">Account & preferences</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
        <section className={`rounded-2xl border p-5 sm:p-6 shadow-sm ${isDark ? "bg-[#111b21] border-slate-700" : "bg-white border-slate-200"}`}>
          <div className="flex items-center gap-4">
            <div className={`h-16 w-16 rounded-full flex items-center justify-center text-xl font-bold ${isDark ? "bg-slate-700 text-white" : "bg-slate-800 text-white"}`}>{initial}</div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold truncate">{user?.displayName || "User"}</h2>
              <p className="text-sm text-slate-400 truncate">{user?.email || ""}</p>
            </div>
          </div>

          <div className="mt-6">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">User ID</label>
            <div className={`mt-2 rounded-xl border px-3 py-3 text-sm break-all ${isDark ? "bg-[#202c33] border-slate-700" : "bg-slate-50 border-slate-200"}`}>
              {user?.id || user?._id || "Not available"}
            </div>
          </div>
        </section>

        <section className={`mt-4 rounded-2xl border p-5 sm:p-6 shadow-sm ${isDark ? "bg-[#111b21] border-slate-700" : "bg-white border-slate-200"}`}>
          <h2 className="font-semibold">Appearance</h2>
          <p className="mt-1 text-sm text-slate-400">Choose how VYBE looks on your device.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[["light","Light"],["dark","Dark"]].map(([value,label]) => (
              <button key={value} type="button" onClick={() => setTheme(value)} className={`rounded-xl border px-4 py-3 text-sm font-medium transition ${theme === value ? "border-slate-800 bg-slate-800 text-white" : isDark ? "border-slate-700 hover:bg-slate-800" : "border-slate-200 hover:bg-slate-50"}`}>{label}</button>
            ))}
          </div>
        </section>

        <section className={`mt-4 rounded-2xl border p-5 sm:p-6 shadow-sm ${isDark ? "bg-[#111b21] border-slate-700" : "bg-white border-slate-200"}`}>
          <h2 className="font-semibold">Settings</h2>
          <Link to="/notification-settings" className={`mt-3 block rounded-xl border px-4 py-3 text-sm font-medium ${isDark ? "border-slate-700 hover:bg-slate-800" : "border-slate-200 hover:bg-slate-50"}`}>Notification Settings</Link>
        </section>

        <button type="button" onClick={logout} className="mt-6 w-full rounded-xl bg-slate-800 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700">Log out</button>
      </main>
    </div>
  );
}

// ======================================================
// Message Bubble
// ======================================================

function MessageBubble({
  message,
  isOwn,
  isDark,
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
            : isDark
              ? "bg-[#202c33] border border-slate-700 text-slate-100 rounded-bl-md"
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
