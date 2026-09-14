import { getStorageOverview } from "../services/storageStats.service.js";
import { getOrCreateRetentionSettings, RetentionSettings } from "../models/RetentionSettings.js";
import { purgeMessages, previewPurge } from "../services/messageCleanup.service.js";
import { recordAuditLog } from "../models/AuditLog.js";
import { Group } from "../models/Group.js";

const ALLOWED_RETENTION_DAYS = [30, 60, 90, 180]; // "Custom" = any other positive integer

// --- GET /api/storage/overview (Super Admin only) ---
export async function getOverview(req, res) {
  const overview = await getStorageOverview();
  const retention = await getOrCreateRetentionSettings();
  return res.status(200).json({ ...overview, retention });
}

// --- GET /api/storage/retention (Super Admin only) ---
export async function getRetention(req, res) {
  const retention = await getOrCreateRetentionSettings();
  return res.status(200).json({ retention });
}

// --- PATCH /api/storage/retention  { enabled, retentionDays } ---
// Crossing a usage threshold never triggers deletion on its own (spec §29)
// — only this explicit config change, or a manual flush, ever deletes data.
export async function updateRetention(req, res) {
  const { enabled, retentionDays } = req.body;

  const update = {};
  if (typeof enabled === "boolean") update.enabled = enabled;
  if (retentionDays !== undefined) {
    if (!Number.isInteger(retentionDays) || retentionDays < 1) {
      return res.status(400).json({ error: "retentionDays must be a positive integer." });
    }
    update.retentionDays = retentionDays;
  }
  update.updatedBy = req.user._id;

  const settings = await getOrCreateRetentionSettings();
  Object.assign(settings, update);
  await settings.save();

  await recordAuditLog({
    actorId: req.user._id,
    action: "RETENTION_SETTINGS_UPDATED",
    targetType: "RetentionSettings",
    targetId: settings._id,
    metadata: { enabled: settings.enabled, retentionDays: settings.retentionDays },
  });

  return res.status(200).json({ retention: settings });
}

function buildFlushFilter({ groupId, olderThanDays }) {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const filter = { createdAt: { $lt: cutoff } };
  if (groupId) filter.groupId = groupId;
  return { filter, cutoff };
}

// --- POST /api/storage/flush/preview  { groupId?, olderThanDays } ---
// Shows exactly what would be deleted before the Super Admin confirms
// (spec §31) — nothing is deleted by this call.
export async function previewFlush(req, res) {
  const { groupId, olderThanDays } = req.body;

  if (!Number.isInteger(olderThanDays) || olderThanDays < 1) {
    return res.status(400).json({ error: "olderThanDays must be a positive integer." });
  }
  if (groupId) {
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: "Group not found." });
  }

  const { filter, cutoff } = buildFlushFilter({ groupId, olderThanDays });
  const preview = await previewPurge(filter);

  return res.status(200).json({ ...preview, cutoff });
}

// --- POST /api/storage/flush  { groupId?, olderThanDays, confirm: true } ---
// Deletion is permanent (spec §31) — requires the explicit confirm flag
// so this can never be triggered by an accidental double-click/retry.
export async function manualFlush(req, res) {
  const { groupId, olderThanDays, confirm } = req.body;

  if (confirm !== true) {
    return res.status(400).json({ error: "Explicit confirmation is required to flush messages." });
  }
  if (!Number.isInteger(olderThanDays) || olderThanDays < 1) {
    return res.status(400).json({ error: "olderThanDays must be a positive integer." });
  }
  if (groupId) {
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: "Group not found." });
  }

  const { filter, cutoff } = buildFlushFilter({ groupId, olderThanDays });
  const result = await purgeMessages(filter);

  await recordAuditLog({
    actorId: req.user._id,
    action: "MANUAL_MESSAGE_FLUSH",
    targetType: groupId ? "Group" : "System",
    targetId: groupId || null,
    metadata: { cutoff, olderThanDays, ...result },
  });

  return res.status(200).json({ message: "Flush complete.", ...result });
}

export { ALLOWED_RETENTION_DAYS };
