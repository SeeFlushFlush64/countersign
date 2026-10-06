import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    globalSetup: ["test/harness/global-setup.ts"],
    setupFiles: ["test/harness/per-file-setup.ts"],
    // Files run one at a time: each already has its own database, but they
    // all drive real Chromium renders, and cloning from one template database
    // must not happen concurrently.
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 180_000,
  },
});
