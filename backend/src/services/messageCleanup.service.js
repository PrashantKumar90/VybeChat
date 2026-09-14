import { Message } from "../models/Message.js";
import { deleteImage } from "./imageStorage.service.js";

const BATCH_SIZE = 200;

/**
 * Deletes every message matching `filter` in batches, cleaning up each
 * IMAGE message's external asset first. Never loads the full result set
 * into memory (spec §30, §51) — pulls one batch, deletes it, repeats.
 * Retry-safe: an external delete that 404s (already gone) is treated as
 * success, so re-running after a partial failure won't get stuck.
 */
export async function purgeMessages(filter) {
  let deletedCount = 0;
  let imagesDeletedCount = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const batch = await Message.find(filter).limit(BATCH_SIZE).select("_id type image");
    if (batch.length === 0) break;

    const imageMessages = batch.filter((m) => m.type === "IMAGE" && m.image?.storageId);
    const results = await Promise.allSettled(
      imageMessages.map((m) => deleteImage(m.image.storageId))
    );
    imagesDeletedCount += results.filter((r) => r.status === "fulfilled").length;
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        console.error(
          `[cleanup] failed to delete external image ${imageMessages[i].image.storageId}:`,
          r.reason?.message
        );
      }
    });

    const ids = batch.map((m) => m._id);
    const { deletedCount: batchDeleted } = await Message.deleteMany({ _id: { $in: ids } });
    deletedCount += batchDeleted;

    if (batch.length < BATCH_SIZE) break; // last batch
  }

  return { deletedCount, imagesDeletedCount };
}

/**
 * Counts what a purge would delete, without deleting anything — used to
 * show the confirmation screen before a manual flush (spec §31).
 */
export async function previewPurge(filter) {
  const [messageCount, imageCount] = await Promise.all([
    Message.countDocuments(filter),
    Message.countDocuments({ ...filter, type: "IMAGE" }),
  ]);
  return { messageCount, imageCount };
}
