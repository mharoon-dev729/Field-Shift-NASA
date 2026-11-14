import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // No network in the default suite: every adapter is driven by a stub fetch.
    testTimeout: 20_000,
    hookTimeout: 30_000,
    reporters: "default",
  },
});
