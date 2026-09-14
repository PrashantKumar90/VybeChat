import "dotenv/config";
import http from "http";
import { Server as SocketIOServer } from "socket.io";

import { createApp } from "./app.js";
import { connectDB } from "./config/db.js";
import { startRetentionScheduler } from "./services/retentionJob.service.js";
import { socketAuthMiddleware } from "./socket/socketAuth.js";
import { registerChatHandlers } from "./socket/chatSocket.js";

const app = createApp();
const server = http.createServer(app);

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// --- Socket.IO ---
const io = new SocketIOServer(server, {
  cors: {
    origin: FRONTEND_URL,
    credentials: true,
  },
});

// Lets REST controllers broadcast over the same
// Socket.IO server without importing server.js.
app.locals.io = io;

io.use(socketAuthMiddleware);

io.on("connection", (socket) => {
  console.log(
    `[socket] ${socket.user.username || socket.user.email} connected (${socket.id})`
  );

  registerChatHandlers(io, socket);

  socket.on("disconnect", () => {
    console.log(
      `[socket] ${socket.user.username || socket.user.email} disconnected (${socket.id})`
    );
  });
});

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    // MongoDB connection must succeed before starting the server.
    await connectDB();

    startRetentionScheduler();

    server.listen(PORT, () => {
      console.log(`[server] listening on port ${PORT}`);
    });
  } catch (err) {
    console.error("[server] failed to start:", err.message);
    process.exit(1);
  }
}

start();