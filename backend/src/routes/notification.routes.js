import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import {
  getVapidPublicKey,
  subscribe,
  unsubscribe,
  getPreferences,
  updatePreferences,
} from "../controllers/notification.controller.js";

const router = Router();

router.get("/vapid-public-key", getVapidPublicKey); // public — needed before login on some flows

router.use(requireAuth);
router.post("/subscribe", subscribe);
router.delete("/subscribe", unsubscribe);
router.get("/preferences", getPreferences);
router.patch("/preferences", updatePreferences);

export default router;
