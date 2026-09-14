import mongoose from "mongoose";

// One small doc per (user, group) pair — not one doc per message read,
// which is what spec §21 explicitly warns against.
const messageReadSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
    },
    lastReadAt: {
      type: Date,
      default: () => new Date(),
    },
  },
  { timestamps: true }
);

messageReadSchema.index({ userId: 1, groupId: 1 }, { unique: true });

export const MessageRead = mongoose.model("MessageRead", messageReadSchema);
