import mongoose from "mongoose";

// A single document holds the system-wide retention policy — there's
// only ever one, so we don't bother with a lookup key beyond the default _id.
const retentionSettingsSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    retentionDays: { type: Number, default: 90 }, // 30/60/90/180/custom (spec §30)
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const RetentionSettings = mongoose.model("RetentionSettings", retentionSettingsSchema);

export async function getOrCreateRetentionSettings() {
  let settings = await RetentionSettings.findOne();
  if (!settings) {
    settings = await RetentionSettings.create({});
  }
  return settings;
}
