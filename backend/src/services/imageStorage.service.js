/**
 * External image storage abstraction (spec §25). MongoDB stores ONLY
 * metadata (url, storageId, dimensions, size, mimeType) — never the
 * binary. This module is the single seam to swap providers later
 * (Cloudinary, S3, etc.) without touching controllers.
 *
 * Default implementation targets Cloudinary since it needs no separate
 * bucket/CDN setup for a small app, but the interface is provider-agnostic:
 * uploadImage(buffer, mimeType) -> { url, storageId, width, height, fileSize }
 * deleteImage(storageId) -> void
 */
import { v2 as cloudinary } from "cloudinary";

let configured = false;

function ensureConfigured() {
  if (configured) return;

  cloudinary.config({
    cloud_name: process.env.IMAGE_STORAGE_BUCKET, // Cloudinary "cloud name"
    api_key: process.env.IMAGE_STORAGE_API_KEY,
    api_secret: process.env.IMAGE_STORAGE_SECRET,
  });

  configured = true;
}

export async function uploadImage(buffer, mimeType) {
  ensureConfigured();

  const dataUri = `data:${mimeType};base64,${buffer.toString("base64")}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    folder: "group-chat-app",
    resource_type: "image",
  });

  return {
    url: result.secure_url,
    storageId: result.public_id,
    width: result.width,
    height: result.height,
    fileSize: result.bytes,
  };
}

export async function deleteImage(storageId) {
  ensureConfigured();
  // Retry-safe: Cloudinary treats deleting an already-gone asset as a
  // no-op success, so callers don't need special-case handling.
  await cloudinary.uploader.destroy(storageId, { resource_type: "image" });
}
