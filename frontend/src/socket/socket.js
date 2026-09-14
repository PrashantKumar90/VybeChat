import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

let socket = null;

/**
 * Returns a singleton, authenticated socket connection. Token is sent in
 * the handshake `auth` payload, not as a query param, so it never ends up
 * logged in server access logs.
 */
export function getSocket() {
  if (socket) return socket;

  const token = localStorage.getItem("token");
  socket = io(SOCKET_URL, {
    auth: { token },
    autoConnect: false,
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
