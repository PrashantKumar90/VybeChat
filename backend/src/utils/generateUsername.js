import { User } from "../models/User.js";

/**
 * Generates a unique, system-assigned username (e.g. "PK10482").
 * Never derived from email/display name — keeps it a stable internal id.
 */
export async function generateUniqueUsername() {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let attempt;
  let exists = true;

  while (exists) {
    const l1 = letters[Math.floor(Math.random() * letters.length)];
    const l2 = letters[Math.floor(Math.random() * letters.length)];
    const digits = Math.floor(10000 + Math.random() * 90000); // 5 digits
    attempt = `${l1}${l2}${digits}`;
    exists = await User.exists({ username: attempt });
  }

  return attempt;
}
