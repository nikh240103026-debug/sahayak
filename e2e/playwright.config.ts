import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
export const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
// A throwaway key for the local test server only (32 zero-ish bytes would also do; never used in production).
const TEST_KEY = Buffer.alloc(32, 7).toString("base64");

/**
 * Projects:
 * - agent: the worker's executor drives real Chromium through the demo portal
 *   (in-memory portal store, no database or API key needed).
 * - a11y:  axe-core checks on public screens.
 * - app:   the full stack (sign up -> receipt). Needs a Supabase project (local CLI
 *          or hosted) and a running worker: set E2E_FULL_STACK=1 plus the usual env.
 */
export default defineConfig({
  testDir: ".",
  timeout: 6 * 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: { baseURL: BASE_URL, trace: "retain-on-failure" },
  projects: [
    { name: "agent", testMatch: /agent\.spec\.ts/ },
    { name: "a11y", testMatch: /a11y\.spec\.ts/ },
    { name: "app", testMatch: /app\.spec\.ts/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run dev -w @app/web -- --port ${PORT}`,
        url: `${BASE_URL}/demo-portal`,
        timeout: 240_000,
        reuseExistingServer: !process.env.CI,
        env: {
          DEMO_PORTAL_STORE: process.env.E2E_FULL_STACK ? "supabase" : "memory",
          ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? TEST_KEY,
          NEXT_PUBLIC_SITE_URL: BASE_URL,
          DEMO_PORTAL_BASE_URL: BASE_URL,
          RETENTION_HOURS: "24",
          NEXT_TELEMETRY_DISABLED: "1",
        },
      },
});

export { TEST_KEY };
