import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../src/models/User.js";
import { Group } from "../src/models/Group.js";
import { GroupMember } from "../src/models/GroupMember.js";

let counter = 0;
function unique(prefix) {
  counter += 1;
  return `${prefix}${counter}`;
}

export async function createUser({ role = "USER", status = "ACTIVE", password = "password123" } = {}) {
  const passwordHash = await bcrypt.hash(password, 4); // low cost factor — tests only
  const user = await User.create({
    email: `${unique("user")}@example.com`,
    username: unique("USR"),
    displayName: unique("Display"),
    passwordHash,
    role,
    status,
  });
  return { user, password };
}

export function tokenFor(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });
}

export function authHeader(user) {
  return { Authorization: `Bearer ${tokenFor(user)}` };
}

export async function createGroup({ createdBy } = {}) {
  const creator = createdBy || (await createUser({ role: "SUPER_ADMIN" })).user;
  return Group.create({ name: unique("Group"), createdBy: creator._id });
}

export async function addMember(groupId, userId, role = "MEMBER") {
  return GroupMember.create({ groupId, userId, role, status: "ACTIVE" });
}
