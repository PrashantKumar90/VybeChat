import { api } from "./api.js";

export const groupService = {
  listGroups: () => api.get("/groups"),
  listUnreadCounts: () => api.get("/groups/unread-counts"),
  getGroup: (groupId) => api.get(`/groups/${groupId}`),

  getMessages: (groupId, before) =>
    api.get(`/groups/${groupId}/messages`, { params: before ? { before } : {} }),

  markRead: (groupId) => api.post(`/groups/${groupId}/messages/read`),

  listMembers: (groupId) => api.get(`/groups/${groupId}/members`),

  sendImage: (groupId, file) => {
    const formData = new FormData();
    formData.append("image", file);
    return api.post(`/groups/${groupId}/messages/image`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
};
