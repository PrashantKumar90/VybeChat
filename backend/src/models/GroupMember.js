import mongoose from "mongoose";

// Group-specific role. GROUP_ADMIN here does NOT imply global admin rights.
const GROUP_ROLES = ["MEMBER", "GROUP_ADMIN"];

const groupMemberSchema = new mongoose.Schema(
  {
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: GROUP_ROLES,
      default: "MEMBER",
    },
    status: {
      type: String,
      enum: ["ACTIVE", "REMOVED"],
      default: "ACTIVE",
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// A user can only have one membership record per group.
groupMemberSchema.index({ groupId: 1, userId: 1 }, { unique: true });
groupMemberSchema.index({ userId: 1 });

export const GroupMember = mongoose.model("GroupMember", groupMemberSchema);
export { GROUP_ROLES };
