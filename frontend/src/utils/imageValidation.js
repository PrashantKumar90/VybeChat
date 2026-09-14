export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB — matches backend default

export function validateImageFile(file) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return "Unsupported image format. Please use JPEG, PNG, WEBP, or GIF.";
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return "Image is too large. Maximum size is 5 MB.";
  }
  return null;
}
