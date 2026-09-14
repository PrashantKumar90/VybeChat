import crypto from "crypto";

/**
 * Generates a cryptographically secure random token and its SHA-256 hash.
 * The raw token is what gets emailed/used in URLs; only the hash is stored
 * in MongoDB, so a database leak alone can't be used to set up/reset accounts.
 */
export function generateSecureToken() {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  return { rawToken, tokenHash };
}

export function hashToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}
