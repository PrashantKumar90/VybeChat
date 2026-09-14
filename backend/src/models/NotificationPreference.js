import mongoose from "mongoose";

// No private-message settings — V1 has no private messaging (spec §27).
const notificationPreferenceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    groupMessageNotifications: { type: Boolean, default: true },
    messagePreview: { type: Boolean, default: true },
    notificationSound: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const NotificationPreference = mongoose.model(
  "NotificationPreference",
  notificationPreferenceSchema
);
