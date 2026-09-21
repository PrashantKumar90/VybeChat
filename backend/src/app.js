import express from "express";
import cors from "cors";
import helmet from "helmet";

import healthRoutes from "./routes/health.routes.js";
import authRoutes from "./routes/auth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import groupRoutes from "./routes/group.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import storageRoutes from "./routes/storage.routes.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

  app.use(helmet());
  app.use(cors({ origin: FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: "1mb" }));

  // --- Routes ---
  app.use("/health", healthRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/groups", groupRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/storage", storageRoutes);

  // Centralized error handler (never leak stack traces / secrets)
  app.use((err, req, res, next) => {
    if (err?.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "Image exceeds the maximum allowed size." });
    }
    console.error("[error]", err.message);
    res.status(err.status || 500).json({
      error: err.publicMessage || "Something went wrong. Please try again.",
    });
  });

  return app;
}
