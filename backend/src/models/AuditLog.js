import mongoose from "mongoose";

// Never log passwords, reset tokens, setup tokens, or auth secrets in
// `metadata` — spec §33 is explicit about this.
const auditLogSchema = new mongoose.Schema(
  {
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null, // null for system-initiated actions (e.g. automatic cleanup)
    },
    action: { type: String, required: true },
    targetType: { type: String, required: true }, // e.g. "Group", "User", "Message"
    targetId: { type: mongoose.Schema.Types.Mixed, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: "timestamp", updatedAt: false } }
);

auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });

export const AuditLog = mongoose.model("AuditLog", auditLogSchema);

export async function recordAuditLog({ actorId = null, action, targetType, targetId = null, metadata = {} }) {
  try {
    await AuditLog.create({ actorId, action, targetType, targetId, metadata });
  } catch (err) {
    // Auditing must never break the underlying operation it's logging.
    console.error("[audit] failed to record log:", err.message);
  }
}
