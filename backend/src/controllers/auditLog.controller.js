import { AuditLog } from "../models/AuditLog.js";

// --- GET /api/admin/audit-logs?action=&targetType=&page=&limit= ---
export async function listAuditLogs(req, res) {
  const { action, targetType, page = 1, limit = 50 } = req.query;

  const filter = {};
  if (action) filter.action = action;
  if (targetType) filter.targetType = targetType;

  const pageNum = Math.max(1, Number(page));
  const pageSize = Math.min(200, Math.max(1, Number(limit)));

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .populate("actorId", "displayName email")
      .sort({ timestamp: -1 })
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize),
    AuditLog.countDocuments(filter),
  ]);

  return res.status(200).json({ logs, total, page: pageNum, pageSize });
}
