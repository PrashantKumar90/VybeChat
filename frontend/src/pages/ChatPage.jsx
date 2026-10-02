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
    e?.preventDefault();

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
      }, 1000);
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

  // --------------------------------------------------
  // WhatsApp-style coded chat wallpaper
  // Pure inline SVG + CSS. No external image is used.
  // --------------------------------------------------

  const wallpaperSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="360" height="360" viewBox="0 0 360 360">
  <g
    fill="none"
    stroke="${isDark ? "#64736f" : "#aaa49a"}"
    stroke-width="1.45"
    stroke-linecap="round"
    stroke-linejoin="round"
    opacity="${isDark ? "0.28" : "0.32"}"
  >
    <!-- chat bubble -->
    <path d="M24 31c0-9 7-16 16-16h31c9 0 16 7 16 16s-7 16-16 16H51l-10 8 3-8h-4c-9 0-16-7-16-16z"/>
    <circle cx="48" cy="31" r="1.5"/><circle cx="56" cy="31" r="1.5"/><circle cx="64" cy="31" r="1.5"/>

    <!-- smiley -->
    <circle cx="125" cy="30" r="19"/>
    <circle cx="118" cy="26" r="1.8"/><circle cx="132" cy="26" r="1.8"/>
    <path d="M116 34q9 8 18 0"/>

    <!-- heart -->
    <path d="M202 25c-7-9-20 1-10 11l10 10 10-10c10-10-3-20-10-11z"/>

    <!-- star -->
    <path d="M286 15l4 10 11 1-8 7 3 11-10-6-10 6 3-11-8-7 11-1z"/>

    <!-- paper plane -->
    <path d="M314 74l30-18-12 34-8-13-10-3z"/><path d="M324 77l20-21"/>

    <!-- camera -->
    <rect x="37" y="91" width="49" height="34" rx="7"/>
    <path d="M48 91l5-8h16l5 8"/><circle cx="61.5" cy="108" r="9"/><circle cx="61.5" cy="108" r="3"/>

    <!-- headphones -->
    <path d="M120 108a22 22 0 0 1 44 0"/>
    <path d="M120 108v13q0 6 7 6h5v-18h-12"/><path d="M164 108v13q0 6-7 6h-5v-18h12"/>

    <!-- small sparkle -->
    <path d="M214 94l3 8 8 3-8 3-3 8-3-8-8-3 8-3z"/>

    <!-- calendar -->
    <rect x="273" y="103" width="54" height="45" rx="5"/>
    <path d="M273 116h54M286 97v13M314 97v13"/>
    <path d="M285 128h6M299 128h6M313 128h6M285 139h6M299 139h6"/>

    <!-- phone -->
    <rect x="26" y="174" width="29" height="54" rx="5"/>
    <path d="M32 181h17"/><circle cx="40.5" cy="218" r="2"/>
    <circle cx="40.5" cy="198" r="8"/><path d="M36 198q4-5 9 0"/>

    <!-- coffee cup -->
    <path d="M91 190h38v18q0 11-19 11t-19-11z"/>
    <path d="M129 195h8q9 0 9 8t-9 8h-8"/>
    <path d="M101 181q-5-7 1-13M112 181q-5-7 1-13M123 181q-5-7 1-13"/>

    <!-- laptop -->
    <rect x="185" y="174" width="54" height="36" rx="3"/>
    <path d="M177 216h70M189 211h46"/>

    <!-- location pin -->
    <path d="M292 173c-12 0-20 8-20 19 0 14 20 30 20 30s20-16 20-30c0-11-8-19-20-19z"/>
    <circle cx="292" cy="192" r="6"/>

    <!-- music note -->
    <path d="M34 285v-34l25-6v28"/><circle cx="26" cy="288" r="7"/><circle cx="51" cy="281" r="7"/>
    <path d="M59 245v-8q8 2 11 7"/>

    <!-- rocket -->
    <path d="M112 255q18 8 22 27l-13 14-14-13q2-18 5-28z"/>
    <circle cx="124" cy="271" r="4"/><path d="M113 283l-10 8M126 294l-7 10"/>

    <!-- message bubble -->
    <path d="M184 267c0-9 7-15 16-15h35c9 0 16 6 16 15s-7 15-16 15h-17l-10 8 3-8h-11c-9 0-16-6-16-15z"/>
    <circle cx="215" cy="267" r="1.5"/><circle cx="223" cy="267" r="1.5"/><circle cx="231" cy="267" r="1.5"/>

    <!-- bicycle -->
    <circle cx="286" cy="283" r="12"/><circle cx="327" cy="283" r="12"/>
    <path d="M286 283l14-20 13 20h-27l13-20 15 0 13 20M302 263l-4-7h8"/>

    <!-- tiny hearts -->
    <path d="M73 308c-5-7-15 1-8 8l8 8 8-8c7-7-3-15-8-8z"/>
    <path d="M172 330c-5-7-15 1-8 8l8 8 8-8c7-7-3-15-8-8z"/>

    <!-- stars -->
    <path d="M32 337l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/>
    <path d="M258 317l3 8 8 3-8 3-3 8-3-8-8-3 8-3z"/>

    <!-- decorative trails -->
    <path d="M150 54q12 11 25 2"/><circle cx="150" cy="54" r="1.5"/><circle cx="158" cy="59" r="1.5"/><circle cx="167" cy="59" r="1.5"/>
    <path d="M66 150q12 10 24 4"/><circle cx="66" cy="150" r="1.5"/><circle cx="74" cy="154" r="1.5"/>
    <path d="M241 150q12-10 24-2"/><circle cx="241" cy="150" r="1.5"/><circle cx="249" cy="146" r="1.5"/>

    <!-- little dots / circles -->
    <circle cx="101" cy="45" r="3"/><circle cx="235" cy="53" r="4"/><circle cx="342" cy="154" r="3"/>
    <circle cx="156" cy="225" r="3"/><circle cx="71" cy="253" r="4"/><circle cx="338" cy="242" r="4"/>
  </g>
</svg>`;

  const chatBackgroundStyle = {
    backgroundColor: isDark ? "#0b141a" : "#efeae2",
    backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(
      wallpaperSvg
    )}")`,
    backgroundRepeat: "repeat",
    backgroundSize: "360px 360px",
    backgroundPosition: "0 0",
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

                  {messages.map((m, index) => {
                    const messageDate = new Date(m.createdAt);
                    const previousMessage = messages[index - 1];
                    const previousDate = previousMessage
                      ? new Date(previousMessage.createdAt)
                      : null;

                    const isNewDate =
                      !previousDate ||
                      messageDate.toDateString() !== previousDate.toDateString();

                    return (
                      <div key={m.id}>
                        {isNewDate && (
                          <div className="flex justify-center my-3">
                            <span
                              className={`px-3 py-1 rounded-lg text-[11px] font-medium shadow-sm ${
                                isDark
                                  ? "bg-[#202c33] text-slate-300"
                                  : "bg-[#e1d9cf] text-slate-600"
                              }`}
                            >
                              {formatMessageDate(messageDate)}
                            </span>
                          </div>
                        )}

                        <MessageBubble
                          message={m}
                          isOwn={
                            m.sender.id ===
                            user.id
                          }
                          isDark={isDark}
                        />
                      </div>
                    );
                  })}

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
                    inputMode="text"
                    enterKeyHint="send"
                    className={`min-w-0 flex-1 h-11 rounded-full border px-4 text-sm focus:outline-none focus:ring-2 touch-manipulation ${
                      isDark
                        ? "border-slate-600 bg-[#202c33] text-slate-100 placeholder:text-slate-500 focus:bg-[#202c33] focus:ring-slate-600"
                        : "border-slate-300 bg-slate-50 text-slate-800 placeholder:text-slate-400 focus:bg-white focus:ring-slate-400"
                    }`}
                  />

                  {/* Send */}
                  <button
                    type="button"
                    aria-label="Send message"
                    onPointerDown={(e) => e.preventDefault()}
                    onMouseDown={(e) => e.preventDefault()}
                    onTouchStart={(e) => e.preventDefault()}
                    onClick={() => sendMessage()}
                    className="h-11 min-w-11 px-4 shrink-0 rounded-full bg-slate-800 text-white font-medium hover:bg-slate-700 active:bg-slate-900 touch-manipulation"
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

        {user?.role === "SUPER_ADMIN" && (
          <section className={`mt-4 rounded-2xl border p-5 sm:p-6 shadow-sm ${isDark ? "bg-[#111b21] border-slate-700" : "bg-white border-slate-200"}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">Admin & Permissions</h2>
                <p className="mt-1 text-sm text-slate-400">Your Super Admin permissions in VYBE.</p>
              </div>
              <span className="shrink-0 rounded-full bg-slate-800 px-3 py-1 text-[11px] font-semibold text-white">SUPER ADMIN</span>
            </div>

            <div className="mt-4 space-y-2">
              {[
                "Manage users and account status",
                "Approve or reject new registrations",
                "Create, edit, and delete groups",
                "Add or remove users from groups",
                "Promote users to Group Admin",
                "Demote Group Admins",
                "Access and manage all groups",
              ].map((permission) => (
                <div
                  key={permission}
                  className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm ${isDark ? "border-slate-700 bg-[#202c33]" : "border-slate-200 bg-slate-50"}`}
                >
                  <span className="mt-0.5 text-green-500">✓</span>
                  <span>{permission}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <button type="button" onClick={logout} className="mt-6 w-full rounded-xl bg-slate-800 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700">Log out</button>
      </main>
    </div>
  );
}

// ======================================================
// Message Date Separator
// ======================================================

function formatMessageDate(date) {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return "Today";
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
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
