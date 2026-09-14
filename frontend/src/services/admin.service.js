import { api } from "./api.js";

export const adminService = {
  listRegistrations: () => api.get("/admin/registrations"),
  approveRegistration: (userId) => api.post(`/admin/registrations/${userId}/approve`),
  rejectRegistration: (userId, reason) =>
    api.post(`/admin/registrations/${userId}/reject`, { reason }),

  listUsers: (params) => api.get("/admin/users", { params }),
  suspendUser: (userId) => api.patch(`/admin/users/${userId}/suspend`),
  activateUser: (userId) => api.patch(`/admin/users/${userId}/activate`),

  listAuditLogs: (params) => api.get("/admin/audit-logs", { params }),

  createGroup: (name, description) => api.post("/groups", { name, description }),
  editGroup: (groupId, updates) => api.patch(`/groups/${groupId}`, updates),
  deleteGroup: (groupId) => api.delete(`/groups/${groupId}`),

  listMembers: (groupId) => api.get(`/groups/${groupId}/members`),
  addMember: (groupId, userId) => api.post(`/groups/${groupId}/members`, { userId }),
  removeMember: (groupId, userId) => api.delete(`/groups/${groupId}/members/${userId}`),
  promoteMember: (groupId, userId) => api.post(`/groups/${groupId}/members/${userId}/promote`),
  demoteMember: (groupId, userId) => api.post(`/groups/${groupId}/members/${userId}/demote`),
};
