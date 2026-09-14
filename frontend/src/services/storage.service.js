import { api } from "./api.js";

export const storageService = {
  getOverview: () => api.get("/storage/overview"),
  updateRetention: (settings) => api.patch("/storage/retention", settings),
  previewFlush: (params) => api.post("/storage/flush/preview", params),
  flush: (params) => api.post("/storage/flush", { ...params, confirm: true }),
};
