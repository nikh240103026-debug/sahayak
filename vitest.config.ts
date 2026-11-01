import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./apps/web", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["packages/**/test/**/*.test.ts", "apps/**/test/**/*.test.ts"],
    testTimeout: 20_000,
    env: {
      // Throwaway key for unit tests only.
      ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
    },
  },
});
