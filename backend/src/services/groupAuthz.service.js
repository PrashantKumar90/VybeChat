import { GroupMember } from "../models/GroupMember.js";

/**
 * Returns the ACTIVE membership record for a user in a group, or null.
 * Centralized here so every check (routes + sockets) uses the same rule:
 * a REMOVED membership never counts, no matter who's asking.
 */
export async function getActiveMembership(userId, groupId) {
  return GroupMember.findOne({ userId, groupId, status: "ACTIVE" });
}

export async function isActiveMember(userId, groupId) {
  const membership = await getActiveMembership(userId, groupId);
  return Boolean(membership);
}

export async function isGroupAdmin(userId, groupId) {
  const membership = await getActiveMembership(userId, groupId);
  return Boolean(membership) && membership.role === "GROUP_ADMIN";
}

/**
 * Counts ACTIVE Group Admins in a group — used to enforce the rule that
 * a Group Admin can't leave/be demoted if they're the only one (spec §15).
 */
export async function countGroupAdmins(groupId) {
  return GroupMember.countDocuments({
    groupId,
    role: "GROUP_ADMIN",
    status: "ACTIVE",
  });
}
