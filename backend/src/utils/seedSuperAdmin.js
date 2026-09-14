import "dotenv/config";
import bcrypt from "bcryptjs";
import { connectDB } from "../config/db.js";
import { User } from "../models/User.js";
import mongoose from "mongoose";

/**
 * Idempotent seed: creates the default Super Admin ONLY if no
 * SUPER_ADMIN account already exists. Safe to run on every deploy.
 *
 * Credentials come from env vars — never hard-coded, never logged.
 */
async function seedSuperAdmin() {
  const email = process.env.DEFAULT_SUPER_ADMIN_EMAIL;
  const password = process.env.DEFAULT_SUPER_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "DEFAULT_SUPER_ADMIN_EMAIL and DEFAULT_SUPER_ADMIN_PASSWORD must be set."
    );
  }

  await connectDB();

  const existingSuperAdmin = await User.findOne({ role: "SUPER_ADMIN" });
  if (existingSuperAdmin) {
    console.log("[seed] Super Admin already exists — skipping.");
    await mongoose.disconnect();
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const username = "SA" + Math.floor(10000 + Math.random() * 90000);

  await User.create({
    email: email.toLowerCase().trim(),
    username,
    displayName: "Super Admin",
    passwordHash,
    role: "SUPER_ADMIN",
    status: "ACTIVE",
  });

  console.log("[seed] Default Super Admin created successfully.");
  await mongoose.disconnect();
}

seedSuperAdmin().catch((err) => {
  console.error("[seed] Failed:", err.message);
  process.exit(1);
});
