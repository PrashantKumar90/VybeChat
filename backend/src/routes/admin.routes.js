import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import {
  listPendingRegistrations,
  approveRegistration,
  rejectRegistration,
} from "../controllers/admin.controller.js";
import { listUsers, suspendUser, activateUser } from "../controllers/user.controller.js";
import { listAuditLogs } from "../controllers/auditLog.controller.js";

const router = Router();

// Every route here is Super Admin only.
router.use(requireAuth, requireRole("SUPER_ADMIN"));

// Registration review
router.get("/registrations", listPendingRegistrations);
router.post("/registrations/:userId/approve", approveRegistration);
router.post("/registrations/:userId/reject", rejectRegistration);

// User management
router.get("/users", listUsers);
router.patch("/users/:userId/suspend", suspendUser);
router.patch("/users/:userId/activate", activateUser);

// Audit logs
router.get("/audit-logs", listAuditLogs);

export default router;
