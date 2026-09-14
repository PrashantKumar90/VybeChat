import mongoose from "mongoose";

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    storageId: { type: String, required: true }, // external provider's public/storage id
    width: Number,
    height: Number,
    fileSize: Number,
    mimeType: String,
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["TEXT", "IMAGE"],
      required: true,
    },
    text: {
      type: String,
      trim: true,
      maxlength: 4000,
    },
    image: imageSchema,
  },
  { timestamps: true }
);

// Primary access pattern: latest messages in a group, paginated by time.
messageSchema.index({ groupId: 1, createdAt: -1 });

export const Message = mongoose.model("Message", messageSchema);
