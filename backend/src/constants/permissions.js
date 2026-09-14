/**
 * Permission matrix (from the V1 spec, sections 10-12).
 * This file is documentation + constants, not enforcement — actual
 * enforcement lives in auth.middleware.js (global role) and
 * groupAuth.middleware.js (per-group role).
 *
 * SUPER_ADMIN (global):
 *   - Full system access: create/edit/delete groups, manage all users,
 *     approve/reject registrations, activate/suspend users, assign/remove
 *     Group Admins, access every group, manage storage/retention,
 *     view audit logs. Cannot view plaintext passwords.
 *
 * GROUP_ADMIN (per-group, stored in GroupMember.role — NOT global):
 *   - Within their assigned group(s) only: view members, add already-
 *     approved users to the group, remove users from the group.
 *   - Cannot: create/delete groups, approve/reject registrations, create
 *     or remove other Group Admins, touch users outside their group(s),
 *     manage Super Admin, access groups they're not a member of.
 *
 * USER / MEMBER (default):
 *   - Within groups they belong to: send/receive messages, view history,
 *     read/unread + typing indicators, send/receive images, leave the
 *     group, manage their own Display Name + notification preferences.
 *   - Cannot: create groups, add/remove members, assign Group Admin,
 *     approve/reject registrations, manage other users, access groups
 *     they don't belong to.
 */

export const GLOBAL_ROLES = Object.freeze({
  SUPER_ADMIN: "SUPER_ADMIN",
  USER: "USER",
});

export const GROUP_ROLES = Object.freeze({
  MEMBER: "MEMBER",
  GROUP_ADMIN: "GROUP_ADMIN",
});
