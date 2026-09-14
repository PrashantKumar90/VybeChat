import { Router } from "express";
import {
  register,
  login,
  checkAccountSetupToken,
  completeAccountSetup,
  forgotPassword,
  resetPassword,
} from "../controllers/auth.controller.js";
import {
  loginLimiter,
  registerLimiter,
  forgotPasswordLimiter,
} from "../middleware/rateLimit.middleware.js";

const router = Router();

router.post("/register", registerLimiter, register);
router.post("/login", loginLimiter, login);

router.get("/account-setup/:token", checkAccountSetupToken);
router.post("/account-setup/:token", completeAccountSetup);

router.post("/forgot-password", forgotPasswordLimiter, forgotPassword);
router.post("/reset-password/:token", resetPassword);

export default router;
