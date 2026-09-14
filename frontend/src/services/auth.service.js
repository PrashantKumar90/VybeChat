import { api } from "./api.js";

export const authService = {
  register: (email) => api.post("/auth/register", { email }),

  login: (identifier, password) => api.post("/auth/login", { identifier, password }),

  checkAccountSetupToken: (token) => api.get(`/auth/account-setup/${token}`),

  completeAccountSetup: (token, password, displayName) =>
    api.post(`/auth/account-setup/${token}`, { password, displayName }),

  forgotPassword: (identifier) => api.post("/auth/forgot-password", { identifier }),

  resetPassword: (token, newPassword) =>
    api.post(`/auth/reset-password/${token}`, { newPassword }),
};
