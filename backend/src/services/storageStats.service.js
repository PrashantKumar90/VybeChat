import mongoose from "mongoose";
import { User } from "../models/User.js";
import { Group } from "../models/Group.js";
import { Message } from "../models/Message.js";

// MongoDB Atlas free/shared tiers commonly cap around 512MB — override via
// env for a larger tier. This only drives the warning-level calculation,
// not any enforcement.
const STORAGE_LIMIT_BYTES = Number(process.env.STORAGE_LIMIT_BYTES) || 512 * 1024 * 1024;

function warningLevel(usedBytes) {
  const percentUsed = (usedBytes / STORAGE_LIMIT_BYTES) * 100;
  if (percentUsed >= 90) return "CRITICAL";
  if (percentUsed >= 80) return "WARNING";
  return "NORMAL";
}

export async function getStorageOverview() {
  const dbStats = await mongoose.connection.db.stats();

  const [userCount, groupCount, messageCount, imageMessageCount] = await Promise.all([
    User.countDocuments(),
    Group.countDocuments({ status: "ACTIVE" }),
    Message.countDocuments(),
    Message.countDocuments({ type: "IMAGE" }),
  ]);

  const usedBytes = dbStats.dataSize + dbStats.indexSize;
  const percentUsed = Math.round((usedBytes / STORAGE_LIMIT_BYTES) * 1000) / 10;

  return {
    database: {
      dataSizeBytes: dbStats.dataSize,
      indexSizeBytes: dbStats.indexSize,
      usedBytes,
      limitBytes: STORAGE_LIMIT_BYTES,
      percentUsed,
      level: warningLevel(usedBytes),
    },
    counts: { userCount, groupCount, messageCount, imageMessageCount },
  };
}
