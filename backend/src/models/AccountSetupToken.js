import mongoose from "mongoose";

// Stores only a HASH of the setup token. The raw token is emailed to the
// user once and never persisted — matches the "prefer hash over raw" rule.
const accountSetupTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    used: { type: Boolean, default: false },
  },
  { timestamps: true }
);

accountSetupTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL cleanup

export const AccountSetupToken = mongoose.model(
  "AccountSetupToken",
  accountSetupTokenSchema
);
