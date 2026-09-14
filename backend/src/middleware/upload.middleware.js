import multer from "multer";
import { MAX_IMAGE_SIZE_BYTES } from "../utils/imageValidation.js";

// Memory storage: the file never touches disk, since it's forwarded
// straight to external storage and MongoDB only keeps metadata.
const storage = multer.memoryStorage();

export const imageUpload = multer({
  storage,
  limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
}).single("image");
