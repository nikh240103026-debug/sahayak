/**
 * npm run doctor — checks configuration and connectivity and prints exactly
 * what is missing. Exit code 1 when anything blocks a working deployment.
 */
import { createClient } from "@supabase/supabase-js";
import { WebEnv, WorkerEnv, withoutEmpty } from "@app/shared/env";
import { BUNDLED_SERVICES } from "@app/shared/services";
import { loadEnvFiles } from "./load-env";

/** Where to find or how to make each value. */
const HINTS: Record<string, string> = {
  NEXT_PUBLIC_SITE_URL: "the public URL of the web app, e.g. http://localhost:3000 locally or your Vercel URL",
  NEXT_PUBLIC_SUPABASE_URL: "Supabase -> Project Settings -> API -> Project URL",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "Supabase -> Project Settings -> API -> anon public key",
  SUPABASE_SERVICE_ROLE_KEY: "Supabase -> Project Settings -> API -> service_role key (server and worker only)",
  ENCRYPTION_KEY: "run `npm run keygen` and copy ENCRYPTION_KEY; keep a safe copy, it cannot be recovered",
  WORKER_SHARED_SECRET: "run `npm run keygen`; use the same value on the web app and the worker",
  CRON_SECRET: "run `npm run keygen`; also add it to Vercel so the daily cron can authenticate",
  DEMO_PORTAL_BASE_URL: "usually the same as NEXT_PUBLIC_SITE_URL (the demo portal lives inside the web app)",
  GRIEVANCE_EMAIL: "the Grievance Officer's address shown on the Grievances page",
  SUPPORT_EMAIL: "a general help address shown on the Grievances page",
  ANTHROPIC_API_KEY: "console.anthropic.com -> API keys, or set LLM_DISABLED=true to run without AI",
  WORKER_URL: "the public URL of your worker container, e.g. https://<space>.hf.space",
};

const ok = (m: string) => console.log(`  ✔ ${m}`);
const warn = (m: string) => console.log(`  ! ${m}`);
let failures = 0;
const bad = (m: string, fix: string) => {
  failures++;
  console.log(`  ✘ ${m}\n      -> ${fix}`);
};

async function main() {
  const files = loadEnvFiles();
  console.log(`\nEnvironment ${files.length ? `(loaded ${files.join(", ")})` : "(no .env.local found; using the shell environment)"}`);
  const env = withoutEmpty(process.env);
  const reported = new Set<string>();
  for (const [name, schema] of [
    ["web app", WebEnv],
    ["worker", WorkerEnv],
  ] as const) {
    const res = schema.safeParse(env);
    if (res.success) {
      ok(`${name} variables look valid`);
      continue;
    }
    for (const issue of res.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (reported.has(key)) continue;
      reported.add(key);
      const problem = env[key] === undefined ? `${key} is not set (needed by the ${name})` : `${key} is invalid: ${issue.message}`;
      bad(problem, HINTS[key] ?? "see the comment next to it in .env.example");
    }
  }
  if (env.LLM_DISABLED === "true") warn("LLM_DISABLED=true: documents are typed by hand and recovery is rule-based only");
  if (env.ENABLE_REAL_PORTALS === "true") warn("ENABLE_REAL_PORTALS=true: make sure every real portal has a reviewed workflow and terms check");
  if (env.DEMO_PORTAL_STORE === "memory") warn("DEMO_PORTAL_STORE=memory is for local tests only; unset it in deployments");

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  console.log("\nSupabase");
  if (!url || !service || !anon) {
    bad("Supabase URL or keys missing", "copy them from Supabase -> Project Settings -> API");
  } else {
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const ping = await admin.rpc("health_ping");
    if (ping.error) {
      bad(`cannot reach the database: ${ping.error.message}`, "paste supabase/schema.sql into the Supabase SQL editor and run it");
    } else {
      ok("database reachable");
      for (const table of ["accounts", "profiles_private", "consents", "documents", "services", "runs", "run_steps", "approvals", "approval_responses", "receipts", "rate_limits", "demo_applications"]) {
        const r = await admin.from(table).select("*", { head: true, count: "exact" });
        if (r.error) bad(`table ${table}: ${r.error.message}`, "re-run supabase/schema.sql");
      }
      const svc = await admin.from("services").select("slug,version");
      const rows = (svc.data ?? []) as Array<{ slug: string; version: number }>;
      for (const s of BUNDLED_SERVICES) {
        const row = rows.find((r) => r.slug === s.slug);
        if (!row) bad(`service ${s.slug} is not seeded`, "re-run supabase/schema.sql (it includes the seed)");
        else if (row.version !== s.version) warn(`service ${s.slug} is version ${row.version} in the database but ${s.version} in config; run npm run db:schema and re-apply`);
        else ok(`service ${s.slug} v${s.version} seeded`);
      }
      for (const bucket of ["user-documents", "run-artifacts"]) {
        const b = await admin.storage.getBucket(bucket);
        if (b.error || !b.data) bad(`storage bucket ${bucket} missing`, "re-run supabase/schema.sql or create it as a PRIVATE bucket");
        else if (b.data.public) bad(`storage bucket ${bucket} is public`, "make it private in Supabase -> Storage");
        else ok(`storage bucket ${bucket} exists and is private`);
      }
      // RLS sanity: an anonymous client must see nothing and write nothing.
      const anonClient = createClient(url, anon, { auth: { persistSession: false } });
      for (const table of ["profiles_private", "runs", "documents", "consents", "run_steps"]) {
        const r = await anonClient.from(table).select("*").limit(1);
        if (!r.error && (r.data?.length ?? 0) > 0) bad(`anonymous users can read ${table}`, "row-level security is not enabled; re-run supabase/schema.sql");
      }
      const write = await anonClient.from("runs").insert({ user_id: "00000000-0000-0000-0000-000000000000", service_slug: "x", service_version: 1 });
      if (!write.error) bad("anonymous users can write runs", "row-level security is not enabled; re-run supabase/schema.sql");
      else ok("row-level security blocks anonymous reads and writes");
      const svcRead = await anonClient.from("demo_applications").select("*").limit(1);
      if (!svcRead.error && (svcRead.data?.length ?? 0) > 0) bad("demo_applications readable by anon", "re-run supabase/schema.sql");
    }
  }

  console.log("\nWorker");
  if (!env.WORKER_URL) {
    warn("WORKER_URL not set: runs wait for the worker's own polling (fine for docker compose on a laptop)");
  } else {
    try {
      const res = await fetch(new URL("/health", env.WORKER_URL), { signal: AbortSignal.timeout(60_000) });
      const body = (await res.json().catch(() => ({}))) as { llm?: string };
      if (res.ok) ok(`worker healthy (model client: ${body.llm ?? "unknown"})`);
      else bad(`worker /health returned ${res.status}`, "check the worker logs on its host");
    } catch (e) {
      bad(`worker unreachable: ${e instanceof Error ? e.message : String(e)}`, "free hosts sleep; open WORKER_URL/health once, or check the deployment");
    }
  }

  console.log("\nWeb app");
  if (env.NEXT_PUBLIC_SITE_URL) {
    try {
      const res = await fetch(new URL("/api/health", env.NEXT_PUBLIC_SITE_URL), { signal: AbortSignal.timeout(20_000) });
      if (res.ok) ok("web app /api/health ok");
      else warn(`web app /api/health returned ${res.status} (expected before the first deploy)`);
    } catch {
      warn("web app not reachable (fine if you have not deployed or started it yet)");
    }
  }

  console.log(failures ? `\n${failures} problem(s) found. Fix them and run npm run doctor again.\n` : "\nAll checks passed.\n");
  process.exit(failures ? 1 : 0);
}

void main();
