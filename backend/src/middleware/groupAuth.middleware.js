import { Group } from "../models/Group.js";
import {
  getActiveMembership,
  isGroupAdmin,
} from "../services/groupAuthz.service.js";

/**
 * Loads req.params.groupId, confirms the group exists, and resolves the
 * requesting user's membership (if any). Never trusts a groupId the
 * frontend supplies without checking it server-side (spec §17, §35).
 *
 * Sets:
 *   req.group           - the Group document
 *   req.groupMembership - the ACTIVE GroupMember doc, or null
 */
export async function loadGroupContext(req, res, next) {
  const { groupId } = req.params;

  const group = await Group.findById(groupId);
  if (!group || group.status !== "ACTIVE") {
    return res.status(404).json({ error: "Group not found." });
  }

  req.group = group;
  req.groupMembership = await getActiveMembership(req.user._id, groupId);
  next();
}

/**
 * Requires the requester to be an ACTIVE member of the group, OR the
 * global Super Admin (who can access every group per spec §10).
 * Must run after requireAuth and loadGroupContext.
 */
export function requireGroupMembership(req, res, next) {
  if (req.user.role === "SUPER_ADMIN" || req.groupMembership) {
    return next();
  }
  return res.status(403).json({ error: "You are not a member of this group." });
}

/**
 * Requires the requester to be that group's Group Admin, OR the global
 * Super Admin. A Group Admin in Group A has NO special rights in Group B —
 * this only checks the membership loaded for req.params.groupId.
 * Must run after requireAuth and loadGroupContext.
 */
export function requireGroupAdmin(req, res, next) {
  if (req.user.role === "SUPER_ADMIN") {
    return next();
  }
  if (req.groupMembership && req.groupMembership.role === "GROUP_ADMIN") {
    return next();
  }
  return res.status(403).json({ error: "Group Admin privileges required for this group." });
}

/**
 * Socket.IO variant — same rule, different signature (no res/next chain).
 * Returns true/false instead of writing an HTTP response. Used when a
 * client tries to join `group:<groupId>` (spec §35).
 */
export async function canJoinGroupRoom(user, groupId) {
  if (user.role === "SUPER_ADMIN") return true;
  return Boolean(await getActiveMembership(user._id, groupId));
}

export { isGroupAdmin };
