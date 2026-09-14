import mongoose from "mongoose";

// Global role is intentionally limited to SUPER_ADMIN / USER.
// GROUP_ADMIN is a per-group role, stored in GroupMember, never here.
const ROLES = ["SUPER_ADMIN", "USER"];
const STATUSES = ["PENDING", "ACTIVE", "SUSPENDED", "REJECTED"];

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    username: {
      // System-generated at approval time, unique, not shown to other users,
      // not editable. Absent while status === PENDING.
      type: String,
      unique: true,
      sparse: true, // allows many docs with no username yet
      trim: true,
    },
    displayName: {
      // Chosen by the user during account setup (post-approval).
      type: String,
      trim: true,
      default: "",
    },
    passwordHash: {
      // Set only once the user completes account setup.
      type: String,
      select: false, // never returned by default queries
      default: null,
    },
    role: {
      type: String,
      enum: ROLES,
      default: "USER",
    },
    status: {
      type: String,
      enum: STATUSES,
      default: "PENDING",
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
export { ROLES as USER_ROLES, STATUSES as USER_STATUSES };
