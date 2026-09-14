import { Router } from "express";
import { requireGroupAdmin } from "../middleware/groupAuth.middleware.js";
import { requireRole } from "../middleware/auth.middleware.js";
import {
  listMembers,
  addMember,
  removeMember,
  promoteToGroupAdmin,
  demoteToMember,
} from "../controllers/groupMember.controller.js";

// mergeParams so :groupId from the parent router is visible here.
const router = Router({ mergeParams: true });

// requireAuth + loadGroupContext + requireGroupMembership already ran in
// the parent router before this file is mounted.

router.get("/", listMembers);

// Add/remove: Super Admin (any group) or that group's own Group Admin.
router.post("/", requireGroupAdmin, addMember);
router.delete("/:userId", requireGroupAdmin, removeMember);

// Assigning/reverting Group Admin status is Super-Admin-only (spec §11).
router.post("/:userId/promote", requireRole("SUPER_ADMIN"), promoteToGroupAdmin);
router.post("/:userId/demote", requireRole("SUPER_ADMIN"), demoteToMember);

export default router;
