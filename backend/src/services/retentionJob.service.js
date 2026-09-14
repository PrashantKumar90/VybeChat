import { getOrCreateRetentionSettings } from "../models/RetentionSettings.js";
import { purgeMessages } from "./messageCleanup.service.js";
import { recordAuditLog } from "../models/AuditLog.js";

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // once a day is enough (spec §30)

/**
 * Runs one retention pass: does nothing unless a Super Admin has
 * explicitly enabled it (spec §30 — automatic cleanup must be optional
 * and never a surprise). actorId is null on the audit entry since this
 * is system-initiated, not a specific admin's action.
 */
export async function runRetentionCheck() {
  const settings = await getOrCreateRetentionSettings();
  if (!settings.enabled) return;

  const cutoff = new Date(Date.now() - settings.retentionDays * 24 * 60 * 60 * 1000);
  const result = await purgeMessages({ createdAt: { $lt: cutoff } });

  if (result.deletedCount > 0) {
    await recordAuditLog({
      actorId: null,
      action: "AUTOMATIC_CLEANUP",
      targetType: "System",
      metadata: { cutoff, retentionDays: settings.retentionDays, ...result },
    });
    console.log(
      `[retention] deleted ${result.deletedCount} messages (${result.imagesDeletedCount} images) older than ${settings.retentionDays}d`
    );
  }
}

export function startRetentionScheduler() {
  // Run once shortly after boot, then on a fixed interval — never loads
  // the whole message history at once (delegated to purgeMessages' batching).
  setTimeout(() => runRetentionCheck().catch((err) => console.error("[retention] run failed:", err.message)), 60_000);
  setInterval(() => runRetentionCheck().catch((err) => console.error("[retention] run failed:", err.message)), CHECK_INTERVAL_MS);
}
