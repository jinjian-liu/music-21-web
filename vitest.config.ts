import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    exclude: ["node_modules/**", "e2e/**", "dist/**"],
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
