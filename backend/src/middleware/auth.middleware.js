import jwt from "jsonwebtoken";
import { User } from "../models/User.js";

/**
 * Verifies the JWT, loads the current user, and rejects anything but
 * an ACTIVE account. Attaches the user to req.user.
 * Never trust a role/claim from the frontend — this is the real check.
 */
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub);

    if (!user) {
      return res.status(401).json({ error: "Invalid session." });
    }
    if (user.status !== "ACTIVE") {
      return res.status(403).json({ error: "Account is not active." });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired session." });
  }
}

/**
 * Restricts a route to specific global roles (e.g. SUPER_ADMIN).
 * Group-level authorization (Group Admin) is handled separately in
 * Phase 3/4 middleware, since that role is per-group, not global.
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions." });
    }
    next();
  };
}
