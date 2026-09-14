import { User } from "../models/User.js";
import { recordAuditLog } from "../models/AuditLog.js";

// --- GET /api/admin/users?status=&role=&search=&page=&limit= ---
export async function listUsers(req, res) {
  const { status, role, search, page = 1, limit = 25 } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (role) filter.role = role;
  if (search) {
    filter.$or = [
      { email: { $regex: search, $options: "i" } },
      { displayName: { $regex: search, $options: "i" } },
      { username: { $regex: search, $options: "i" } },
    ];
  }

  const pageNum = Math.max(1, Number(page));
  const pageSize = Math.min(100, Math.max(1, Number(limit)));

  const [users, total] = await Promise.all([
    User.find(filter)
      .select("email username displayName role status createdAt lastLoginAt")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize),
    User.countDocuments(filter),
  ]);

  return res.status(200).json({ users, total, page: pageNum, pageSize });
}

// --- PATCH /api/admin/users/:userId/suspend ---
export async function suspendUser(req, res) {
  const { userId } = req.params;

  if (userId === req.user._id.toString()) {
    return res.status(400).json({ error: "You cannot suspend your own account." });
  }

  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ error: "User not found." });
  if (user.role === "SUPER_ADMIN") {
    return res.status(400).json({ error: "Super Admin accounts cannot be suspended." });
  }
  if (user.status !== "ACTIVE") {
    return res.status(400).json({ error: "Only active accounts can be suspended." });
  }

  user.status = "SUSPENDED";
  await user.save();

  await recordAuditLog({
    actorId: req.user._id,
    action: "USER_SUSPENDED",
    targetType: "User",
    targetId: user._id,
    metadata: { email: user.email },
  });

  return res.status(200).json({ message: "User suspended." });
}

// --- PATCH /api/admin/users/:userId/activate ---
// Only reactivates a previously SUSPENDED account — a PENDING/REJECTED
// account must go through the normal approval flow instead.
export async function activateUser(req, res) {
  const { userId } = req.params;

  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ error: "User not found." });
  if (user.status !== "SUSPENDED") {
    return res.status(400).json({ error: "Only suspended accounts can be reactivated here." });
  }

  user.status = "ACTIVE";
  await user.save();

  await recordAuditLog({
    actorId: req.user._id,
    action: "USER_ACTIVATED",
    targetType: "User",
    targetId: user._id,
    metadata: { email: user.email },
  });

  return res.status(200).json({ message: "User activated." });
}
