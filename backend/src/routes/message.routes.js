import { Router } from "express";
import { getMessages, markGroupRead, sendImageMessage } from "../controllers/message.controller.js";
import { imageUpload } from "../middleware/upload.middleware.js";

// mergeParams so :groupId from the parent router is visible here.
// requireAuth + loadGroupContext + requireGroupMembership already ran
// in the parent router before this file is mounted.
const router = Router({ mergeParams: true });

router.get("/", getMessages);
router.post("/read", markGroupRead);
router.post("/image", imageUpload, sendImageMessage);

export default router;
