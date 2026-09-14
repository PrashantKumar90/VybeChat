import dns from "node:dns";
import mongoose from "mongoose";

// MongoDB Atlas SRV DNS resolution
dns.setServers(["8.8.8.8", "8.8.4.4"]);
dns.setDefaultResultOrder("ipv4first");

/**
 * Connects to MongoDB Atlas using the URI provided via environment variables.
 * Keeps the connection lean — no verbose logging of credentials.
 */
export async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is not set in environment variables.");
  }

  mongoose.set("strictQuery", true);

  await mongoose.connect(uri, {
    maxPoolSize: 10,
  });

  console.log("[db] MongoDB connected");

  mongoose.connection.on("error", (err) => {
    console.error("[db] MongoDB connection error:", err.message);
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("[db] MongoDB disconnected");
  });
}

export function isDatabaseHealthy() {
  return mongoose.connection.readyState === 1;
}