import mongoose from "mongoose";
import { GroupMember } from "../models/GroupMember.js";
import { User } from "../models/User.js";
import {
  countGroupAdmins,
  getActiveMembership,
} from "../services/groupAuthz.service.js";
import { recordAuditLog } from "../models/AuditLog.js";

// --- GET /api/groups/:groupId/members ---
// Mounted behind requireGroupMembership.
export async function listMembers(req, res) {
  const members = await GroupMember.find({
    groupId: req.group._id,
    status: "ACTIVE",
  }).populate("userId", "displayName role status");

  return res.status(200).json({
    members: members
      .filter((m) => m.userId)
      .map((m) => ({
        userId: m.userId._id,
        displayName: m.userId.displayName,
        groupRole: m.role,
        joinedAt: m.joinedAt,
      })),
  });
}

// --- POST /api/groups/:groupId/members { userId } ---
// Mounted behind requireGroupAdmin (Super Admin or that group's Group Admin).
// Only already-approved (ACTIVE) users can be added.
export async function addMember(req, res) {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({
      error: "userId is required.",
    });
  }

  // Frontend may send either:
  // 1. MongoDB ObjectId
  // 2. Username / user code such as FB84511
  //
  // Resolve the supplied identifier to the actual User document first.
  let targetUser = null;

  if (mongoose.isValidObjectId(userId)) {
    targetUser = await User.findById(userId);
  } else {
    targetUser = await User.findOne({
      username: userId.trim(),
    });
  }

  if (!targetUser) {
    return res.status(404).json({
      error: "User not found.",
    });
  }

  if (targetUser.status !== "ACTIVE") {
    return res.status(400).json({
      error: "Only approved, active users can be added to a group.",
    });
  }

  const actualUserId = targetUser._id;

  // Upsert: handles both "never a member" and "previously removed" cases
  // cleanly, without tripping the groupId+userId unique index.
  const membership = await GroupMember.findOneAndUpdate(
    {
      groupId: req.group._id,
      userId: actualUserId,
    },
    {
      $set: {
        status: "ACTIVE",
        role: "MEMBER",
        joinedAt: new Date(),
      },
      $setOnInsert: {
        groupId: req.group._id,
        userId: actualUserId,
      },
    },
    {
      upsert: true,
      new: true,
    }
  );

  await recordAuditLog({
    actorId: req.user._id,
    action: "USER_ADDED_TO_GROUP",
    targetType: "Group",
    targetId: req.group._id,
    metadata: {
      userId: actualUserId,
      email: targetUser.email,
    },
  });

  return res.status(200).json({
    message: "User added to group.",
    membership,
  });
}

// --- DELETE /api/groups/:groupId/members/:userId ---
// Mounted behind requireGroupAdmin.
export async function removeMember(req, res) {
  const { userId } = req.params;

  const membership = await getActiveMembership(
    userId,
    req.group._id
  );

  if (!membership) {
    return res.status(404).json({
      error: "This user is not a member of the group.",
    });
  }

  // A Group Admin (non-Super-Admin actor) may never remove another
  // Group Admin — that's a Super-Admin-only action.
  const actorIsSuperAdmin =
    req.user.role === "SUPER_ADMIN";

  if (
    !actorIsSuperAdmin &&
    membership.role === "GROUP_ADMIN"
  ) {
    return res.status(403).json({
      error:
        "Only the Super Admin can remove a Group Admin.",
    });
  }

  membership.status = "REMOVED";
  await membership.save();

  await recordAuditLog({
    actorId: req.user._id,
    action: "USER_REMOVED_FROM_GROUP",
    targetType: "Group",
    targetId: req.group._id,
    metadata: { userId },
  });

  return res.status(200).json({
    message: "User removed from group.",
  });
}

// --- POST /api/groups/:groupId/members/:userId/promote ---
// Super Admin only — assigns Group Admin for this specific group.
export async function promoteToGroupAdmin(req, res) {
  const { userId } = req.params;

  const membership = await getActiveMembership(
    userId,
    req.group._id
  );

  if (!membership) {
    return res.status(404).json({
      error: "This user is not a member of the group.",
    });
  }

  membership.role = "GROUP_ADMIN";
  await membership.save();

  await recordAuditLog({
    actorId: req.user._id,
    action: "GROUP_ADMIN_ASSIGNED",
    targetType: "Group",
    targetId: req.group._id,
    metadata: { userId },
  });

  return res.status(200).json({
    message:
      "User is now a Group Admin for this group.",
  });
}

// --- POST /api/groups/:groupId/members/:userId/demote ---
// Super Admin only — reverts Group Admin back to a normal member.
export async function demoteToMember(req, res) {
  const { userId } = req.params;

  const membership = await getActiveMembership(
    userId,
    req.group._id
  );

  if (
    !membership ||
    membership.role !== "GROUP_ADMIN"
  ) {
    return res.status(400).json({
      error:
        "This user is not a Group Admin in this group.",
    });
  }

  const adminCount = await countGroupAdmins(
    req.group._id
  );

  if (adminCount <= 1) {
    return res.status(400).json({
      error:
        "Assign another Group Admin before removing this one — the group cannot be left without an admin.",
    });
  }

  membership.role = "MEMBER";
  await membership.save();

  await recordAuditLog({
    actorId: req.user._id,
    action: "GROUP_ADMIN_REVERTED",
    targetType: "Group",
    targetId: req.group._id,
    metadata: { userId },
  });

  return res.status(200).json({
    message:
      "User reverted to a normal member.",
  });
}

// --- POST /api/groups/:groupId/leave ---
// Mounted behind requireGroupMembership.
// A Group Admin who is the only admin cannot leave until another
// Group Admin is assigned.
export async function leaveGroup(req, res) {
  if (
    req.user.role === "SUPER_ADMIN" &&
    !req.groupMembership
  ) {
    return res.status(400).json({
      error: "You are not a member of this group.",
    });
  }

  const membership = req.groupMembership;

  if (membership.role === "GROUP_ADMIN") {
    const adminCount = await countGroupAdmins(
      req.group._id
    );

    if (adminCount <= 1) {
      return res.status(400).json({
        error:
          "You're the only Group Admin — assign another before leaving.",
      });
    }
  }

  membership.status = "REMOVED";
  await membership.save();

  return res.status(200).json({
    message: "You have left the group.",
  });
}