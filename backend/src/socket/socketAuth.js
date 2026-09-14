import jwt from "jsonwebtoken";
import { User } from "../models/User.js";

/**
 * Runs once per socket connection attempt, before any events are handled.
 * The client must send { auth: { token } } when connecting — a plain
 * `io()` connection with no token is rejected outright (spec §35).
 */
export async function socketAuthMiddleware(socket, next) {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error("Authentication required."));
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub);

    if (!user || user.status !== "ACTIVE") {
      return next(new Error("Account is not active."));
    }

    socket.user = user;
    next();
  } catch (err) {
    next(new Error("Invalid or expired session."));
  }
}
