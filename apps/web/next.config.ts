import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import createNextIntlPlugin from "next-intl/plugin";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
// One .env.local at the repository root serves the web app, the worker and the scripts.
loadEnvConfig(join(here, "../.."), process.env.NODE_ENV !== "production");
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** Static security headers. The per-request CSP (with a script nonce) is set in proxy.ts. */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@app/shared"],
  serverExternalPackages: ["unpdf"],
  turbopack: { root: join(here, "../..") },
  outputFileTracingRoot: join(here, "../.."),
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withNextIntl(config);
