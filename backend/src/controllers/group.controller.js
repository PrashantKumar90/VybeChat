import { Group } from "../models/Group.js";
import { GroupMember } from "../models/GroupMember.js";
import { purgeMessages } from "../services/messageCleanup.service.js";
import { recordAuditLog } from "../models/AuditLog.js";

// --- POST /api/groups (Super Admin only) ---
export async function createGroup(req, res) {
  const { name, description } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Group name is required." });
  }

  const group = await Group.create({
    name: name.trim(),
    description: (description || "").trim(),
    createdBy: req.user._id,
  });

  await recordAuditLog({
    actorId: req.user._id,
    action: "GROUP_CREATED",
    targetType: "Group",
    targetId: group._id,
    metadata: { name: group.name },
  });

  return res.status(201).json({ group });
}

// --- GET /api/groups ---
// Super Admin sees every active group; everyone else sees only groups
// they currently belong to.
export async function listGroups(req, res) {
  if (req.user.role === "SUPER_ADMIN") {
    const groups = await Group.find({ status: "ACTIVE" }).sort({ createdAt: -1 });
    return res.status(200).json({ groups });
  }

  const memberships = await GroupMember.find({
    userId: req.user._id,
    status: "ACTIVE",
  }).populate({ path: "groupId", match: { status: "ACTIVE" } });

  const groups = memberships
    .filter((m) => m.groupId) // drop memberships whose group is archived/deleted
    .map((m) => ({ ...m.groupId.toObject(), myRole: m.role }));

  return res.status(200).json({ groups });
}

// --- GET /api/groups/:groupId ---
// Mounted behind requireGroupMembership, so req.group is already loaded
// and access already verified.
export async function getGroup(req, res) {
  return res.status(200).json({ group: req.group });
}

// --- PATCH /api/groups/:groupId (Super Admin only) ---
export async function editGroup(req, res) {
  const { name, description } = req.body;

  if (name !== undefined) {
    if (!name.trim()) {
      return res.status(400).json({ error: "Group name cannot be empty." });
    }
    req.group.name = name.trim();
  }
  if (description !== undefined) {
    req.group.description = description.trim();
  }

  await req.group.save();

  await recordAuditLog({
    actorId: req.user._id,
    action: "GROUP_EDITED",
    targetType: "Group",
    targetId: req.group._id,
    metadata: { name: req.group.name },
  });

  return res.status(200).json({ group: req.group });
}

// --- DELETE /api/groups/:groupId (Super Admin only) ---
// Hard delete with cascade cleanup so we don't leave orphaned membership,
// message, or external image records behind (spec §14, §32).
export async function deleteGroup(req, res) {
  const groupId = req.group._id;
  const groupName = req.group.name;

  const { deletedCount, imagesDeletedCount } = await purgeMessages({ groupId });
  await GroupMember.deleteMany({ groupId });
  await Group.deleteOne({ _id: groupId });

  await recordAuditLog({
    actorId: req.user._id,
    action: "GROUP_DELETED",
    targetType: "Group",
    targetId: groupId,
    metadata: { groupName, deletedCount, imagesDeletedCount },
  });

  return res.status(200).json({ message: "Group and its data have been deleted." });
}
