import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { AccountSetupToken } from "../models/AccountSetupToken.js";
import { PasswordResetToken } from "../models/PasswordResetToken.js";
import { generateSecureToken, hashToken } from "../utils/tokenUtil.js";
import {
  sendRegistrationReceivedEmail,
  sendPasswordResetEmail,
} from "../services/email.service.js";

const SETUP_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function signJwt(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

// --- POST /api/auth/register ---
export async function register(req, res) {
  const { email } = req.body;

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: "A valid email is required." });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    // Don't reveal account existence details beyond a generic message.
    return res.status(409).json({ error: "This email is already registered." });
  }

  await User.create({ email: normalizedEmail, role: "USER", status: "PENDING" });

  await sendRegistrationReceivedEmail(normalizedEmail).catch((err) =>
    console.error("[email] registration-received failed:", err.message)
  );

  return res.status(201).json({
    message: "Registration received. Your account is pending approval.",
  });
}

// --- GET /api/auth/account-setup/:token ---
// Lets the frontend validate the token before rendering the setup form.
export async function checkAccountSetupToken(req, res) {
  const { token } = req.params;
  const record = await AccountSetupToken.findOne({ tokenHash: hashToken(token) });

  if (!record || record.used || record.expiresAt < new Date()) {
    return res.status(400).json({ error: "This setup link is invalid or has expired." });
  }

  return res.status(200).json({ valid: true });
}

// --- POST /api/auth/account-setup/:token ---
export async function completeAccountSetup(req, res) {
  const { token } = req.params;
  const { password, displayName } = req.body;

  if (!password || password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }
  if (!displayName || !displayName.trim()) {
    return res.status(400).json({ error: "Display name is required." });
  }

  const record = await AccountSetupToken.findOne({ tokenHash: hashToken(token) });
  if (!record || record.used || record.expiresAt < new Date()) {
    return res.status(400).json({ error: "This setup link is invalid or has expired." });
  }

  const user = await User.findById(record.userId);
  if (!user) {
    return res.status(404).json({ error: "Account not found." });
  }

  user.passwordHash = await bcrypt.hash(password, 12);
  user.displayName = displayName.trim();
  user.status = "ACTIVE";
  await user.save();

  record.used = true;
  await record.save();

  return res.status(200).json({ message: "Account setup complete. You can now log in." });
}

// --- POST /api/auth/login ---
export async function login(req, res) {
  const { identifier, password } = req.body; // identifier = email or username
console.log("[login] identifier:", identifier);
console.log("[login] password received:", !!password);
  if (!identifier || !password) {
    return res.status(400).json({ error: "Email/username and password are required." });
  }

  const query = isValidEmail(identifier)
    ? { email: identifier.toLowerCase().trim() }
    : { username: identifier.trim() };

  const user = await User.findOne(query).select("+passwordHash");
console.log("[login] user found:", !!user);
console.log("[login] user status:", user?.status);
console.log("[login] password hash exists:", !!user?.passwordHash);
  // Generic error message — never reveal which part (identifier vs password) was wrong.
  const genericError = { error: "Invalid credentials." };

  if (!user || !user.passwordHash) {
    return res.status(401).json(genericError);
  }
  if (user.status !== "ACTIVE") {
    return res.status(403).json({ error: "This account is not active yet." });
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    return res.status(401).json(genericError);
  }

  user.lastLoginAt = new Date();
  await user.save();

  const token = signJwt(user);

  return res.status(200).json({
    token,
    user: {
      id: user._id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    },
  });
}

// --- POST /api/auth/forgot-password ---
export async function forgotPassword(req, res) {
  const { identifier } = req.body;

  if (!identifier) {
    return res.status(400).json({ error: "Email or username is required." });
  }

  const query = isValidEmail(identifier)
    ? { email: identifier.toLowerCase().trim() }
    : { username: identifier.trim() };

  const user = await User.findOne(query);

  // Always return the same response, whether or not the account exists,
  // to avoid leaking which emails/usernames are registered.
  const genericResponse = {
    message: "If an account exists, a password reset email has been sent.",
  };

  if (!user || user.status !== "ACTIVE") {
    return res.status(200).json(genericResponse);
  }

  const { rawToken, tokenHash } = generateSecureToken();
  await PasswordResetToken.create({
    userId: user._id,
    tokenHash,
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
  });

  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${rawToken}`;
  await sendPasswordResetEmail({ email: user.email, resetUrl }).catch((err) =>
    console.error("[email] password-reset failed:", err.message)
  );

  return res.status(200).json(genericResponse);
}

// --- POST /api/auth/reset-password/:token ---
export async function resetPassword(req, res) {
  const { token } = req.params;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }

  const record = await PasswordResetToken.findOne({ tokenHash: hashToken(token) });
  if (!record || record.used || record.expiresAt < new Date()) {
    return res.status(400).json({ error: "This reset link is invalid or has expired." });
  }

  const user = await User.findById(record.userId);
  if (!user) {
    return res.status(404).json({ error: "Account not found." });
  }

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  await user.save();

  record.used = true;
  await record.save();

  return res.status(200).json({ message: "Password updated. You can now log in." });
}

export { SETUP_TOKEN_TTL_MS };
