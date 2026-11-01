import { headers } from "next/headers";
import { createHmac } from "node:crypto";
import { deriveKey } from "@app/shared/crypto";
import { publicEnv } from "@/lib/public-env";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * CSRF guard for route handlers that change state. Server Actions already check
 * Origin; JSON/multipart route handlers call this. Cookies are SameSite=Lax too.
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const site = new URL(publicEnv.siteUrl).origin;
  const self = new URL(req.url).origin;
  if (origin) return origin === site || origin === self;
  return req.headers.get("sec-fetch-site") === "same-origin";
}

/**
 * Keyed hash for rate-limit keys, so the rate_limits table never stores an IP
 * address or email in clear (and the hash cannot be reversed by guessing inputs
 * without the server key).
 */
export function limiterKey(kind: string, value: string): string {
  return createHmac("sha256", deriveKey("rate-limit")).update(`${kind}:${value}`).digest("hex").slice(0, 32);
}

/** Client IP as seen by Vercel / a reverse proxy, hashed before use as a rate-limit key. */
export async function clientIpKey(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return limiterKey("ip", ip);
}

/** Fixed-window limit backed by Postgres. Returns true while under the limit. */
export async function hitRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await supabaseAdmin().rpc("hit_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) return true; // fail open on the limiter only, never on auth checks
  return Boolean(data);
}
