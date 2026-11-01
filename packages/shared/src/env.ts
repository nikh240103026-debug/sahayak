import { z } from "zod";

/**
 * Environment schemas, shared by the web app, the worker and `npm run doctor`.
 * Empty strings are treated as "not set".
 */

const bool = z.stringbool().default(false);
const posInt = (d: number) => z.coerce.number().int().positive().default(d);
const secret = (name: string) =>
  z.string().min(32, `${name} must be at least 32 characters (run: npm run keygen)`);
const base64Key = z.string().refine((v) => {
  try {
    return atob(v.trim()).length === 32;
  } catch {
    return false;
  }
}, "must be 32 random bytes, base64 encoded (run: npm run keygen)");

const supabase = {
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
};

const crypto = {
  ENCRYPTION_KEY: base64Key,
  ENCRYPTION_KEY_VERSION: posInt(1),
  ENCRYPTION_PREVIOUS_KEYS: z.string().optional(),
};

const portal = {
  DEMO_PORTAL_BASE_URL: z.url(),
  ALLOWED_PORTAL_HOSTS: z.string().default(""),
  ENABLE_REAL_PORTALS: bool,
};

export const WebEnv = z.object({
  NEXT_PUBLIC_SITE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  ...supabase,
  ...crypto,
  ...portal,
  WORKER_URL: z.url().optional(),
  WORKER_SHARED_SECRET: secret("WORKER_SHARED_SECRET"),
  CRON_SECRET: secret("CRON_SECRET"),
  NEXT_PUBLIC_ENABLE_DEMO_LOGIN: bool,
  NEXT_PUBLIC_ENABLE_GOOGLE_AUTH: bool,
  DEMO_LOGIN_EMAIL: z.email().optional(),
  DEMO_LOGIN_PASSWORD: z.string().min(12).optional(),
  RETENTION_HOURS: posInt(24),
  MAX_RUNS_PER_USER_PER_DAY: posInt(5),
  GRIEVANCE_EMAIL: z.email(),
  SUPPORT_EMAIL: z.email(),
  SENTRY_DSN: z.url().optional(),
  LLM_DISABLED: bool,
});
export type WebEnv = z.infer<typeof WebEnv>;

export const WorkerEnv = z
  .object({
    ...supabase,
    ...crypto,
    ...portal,
    WORKER_SHARED_SECRET: secret("WORKER_SHARED_SECRET"),
    LLM_PROVIDER: z.enum(["anthropic"]).default("anthropic"),
    ANTHROPIC_API_KEY: z.string().optional(),
    LLM_MODEL_AGENT: z.string().default("claude-sonnet-5-5"),
    LLM_MODEL_FAST: z.string().default("claude-haiku-5-5"),
    LLM_DISABLED: bool,
    LLM_FIXTURES: z.enum(["off", "record", "replay"]).default("off"),
    LLM_FIXTURES_DIR: z.string().default("fixtures/llm"),
    PORT: posInt(8080),
    WORKER_ID: z.string().optional(),
    RUN_TIMEOUT_MINUTES: posInt(15),
    HUMAN_WAIT_MINUTES: z.coerce.number().int().positive().max(10).default(10),
    POLL_INTERVAL_MS: posInt(3000),
    IDLE_POLL_INTERVAL_MS: posInt(30000),
    RETENTION_HOURS: posInt(24),
  })
  .superRefine((env, ctx) => {
    if (!env.LLM_DISABLED && env.LLM_FIXTURES !== "replay" && !env.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["ANTHROPIC_API_KEY"],
        message: "required unless LLM_DISABLED=true (the assistant then uses manual entry only)",
      });
    }
  });
export type WorkerEnv = z.infer<typeof WorkerEnv>;

export function withoutEmpty(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (v !== undefined && v.trim() !== "") out[k] = v;
  return out;
}

export function formatEnvIssues(error: z.ZodError): string[] {
  return error.issues.map((i) => `${i.path.join(".") || "(env)"}: ${i.message}`);
}

export function parseEnv<T extends z.ZodType>(schema: T, env: Record<string, string | undefined>): z.infer<T> {
  const result = schema.safeParse(withoutEmpty(env));
  if (!result.success) {
    throw new Error(`Invalid environment:\n  ${formatEnvIssues(result.error).join("\n  ")}`);
  }
  return result.data;
}
