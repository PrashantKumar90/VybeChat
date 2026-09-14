import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.js"],
    testTimeout: 20000, // mongodb-memory-server's first binary download can be slow
    hookTimeout: 30000,
  },
});
