import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import {
  getOverview,
  getRetention,
  updateRetention,
  previewFlush,
  manualFlush,
} from "../controllers/storage.controller.js";

const router = Router();

router.use(requireAuth, requireRole("SUPER_ADMIN"));

router.get("/overview", getOverview);
router.get("/retention", getRetention);
router.patch("/retention", updateRetention);
router.post("/flush/preview", previewFlush);
router.post("/flush", manualFlush);

export default router;
