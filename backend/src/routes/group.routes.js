import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import {
  loadGroupContext,
  requireGroupMembership,
  requireGroupAdmin,
} from "../middleware/groupAuth.middleware.js";
import {
  createGroup,
  listGroups,
  getGroup,
  editGroup,
  deleteGroup,
} from "../controllers/group.controller.js";
import { leaveGroup } from "../controllers/groupMember.controller.js";
import { listUnreadCounts } from "../controllers/message.controller.js";
import groupMemberRoutes from "./groupMember.routes.js";
import messageRoutes from "./message.routes.js";

const router = Router();

router.use(requireAuth);

// --- Group CRUD ---
router.get("/", listGroups);
router.post("/", requireRole("SUPER_ADMIN"), createGroup);

// Registered before "/:groupId" so it isn't swallowed as a groupId.
router.get("/unread-counts", listUnreadCounts);

router.get("/:groupId", loadGroupContext, requireGroupMembership, getGroup);
router.patch("/:groupId", loadGroupContext, requireRole("SUPER_ADMIN"), editGroup);
router.delete("/:groupId", loadGroupContext, requireRole("SUPER_ADMIN"), deleteGroup);

// --- Self-service ---
router.post("/:groupId/leave", loadGroupContext, requireGroupMembership, leaveGroup);

// --- Messages (history, pagination, mark-as-read) ---
router.use(
  "/:groupId/messages",
  loadGroupContext,
  requireGroupMembership,
  messageRoutes
);

// --- Membership management (add/remove/promote/demote) ---
router.use(
  "/:groupId/members",
  loadGroupContext,
  requireGroupMembership,
  groupMemberRoutes
);

// --- RBAC demo/debug endpoints (kept from Phase 3) ---
router.get(
  "/:groupId/access-check",
  loadGroupContext,
  requireGroupMembership,
  (req, res) => {
    res.status(200).json({
      groupId: req.group._id,
      groupName: req.group.name,
      isSuperAdmin: req.user.role === "SUPER_ADMIN",
      isGroupAdmin:
        req.user.role === "SUPER_ADMIN" ||
        req.groupMembership?.role === "GROUP_ADMIN",
      isMember: Boolean(req.groupMembership) || req.user.role === "SUPER_ADMIN",
    });
  }
);

router.get(
  "/:groupId/admin-only-ping",
  loadGroupContext,
  requireGroupAdmin,
  (req, res) => {
    res.status(200).json({ message: "You have Group Admin access here." });
  }
);

export default router;
