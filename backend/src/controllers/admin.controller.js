import { User } from "../models/User.js";
import { AccountSetupToken } from "../models/AccountSetupToken.js";
import { generateSecureToken } from "../utils/tokenUtil.js";
import { generateUniqueUsername } from "../utils/generateUsername.js";
import {
  sendRegistrationApprovedEmail,
  sendRegistrationRejectedEmail,
} from "../services/email.service.js";
import { recordAuditLog } from "../models/AuditLog.js";

const SETUP_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// --- GET /api/admin/registrations ---
// Lists accounts still awaiting Super Admin review.
export async function listPendingRegistrations(req, res) {
  const pending = await User.find({ status: "PENDING", username: { $exists: false } })
    .select("email createdAt")
    .sort({ createdAt: 1 });

  return res.status(200).json({ registrations: pending });
}

// --- POST /api/admin/registrations/:userId/approve ---
export async function approveRegistration(req, res) {
  const { userId } = req.params;

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ error: "Registration not found." });
  }
  if (user.status !== "PENDING") {
    return res.status(400).json({ error: "This registration has already been reviewed." });
  }

  user.username = await generateUniqueUsername();
  await user.save();

  const { rawToken, tokenHash } = generateSecureToken();
  await AccountSetupToken.create({
    userId: user._id,
    tokenHash,
    expiresAt: new Date(Date.now() + SETUP_TOKEN_TTL_MS),
  });

  const setupUrl = `${process.env.FRONTEND_URL}/account-setup/${rawToken}`;
  await sendRegistrationApprovedEmail({
    email: user.email,
    username: user.username,
    setupUrl,
  }).catch((err) => console.error("[email] registration-approved failed:", err.message));

  await recordAuditLog({
    actorId: req.user._id,
    action: "REGISTRATION_APPROVED",
    targetType: "User",
    targetId: user._id,
    metadata: { email: user.email, username: user.username },
  });

  return res.status(200).json({ message: "Registration approved.", username: user.username });
}

// --- POST /api/admin/registrations/:userId/reject ---
export async function rejectRegistration(req, res) {
  const { userId } = req.params;
  const { reason } = req.body;

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ error: "Registration not found." });
  }
  if (user.status !== "PENDING") {
    return res.status(400).json({ error: "This registration has already been reviewed." });
  }

  user.status = "REJECTED";
  await user.save();

  await sendRegistrationRejectedEmail({ email: user.email, reason }).catch((err) =>
    console.error("[email] registration-rejected failed:", err.message)
  );

  await recordAuditLog({
    actorId: req.user._id,
    action: "REGISTRATION_REJECTED",
    targetType: "User",
    targetId: user._id,
    metadata: { email: user.email, reason: reason || null },
  });

  return res.status(200).json({ message: "Registration rejected." });
}
