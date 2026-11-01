# Sahayak

**We fill the forms. You make the decisions.**

Sahayak is a web app that helps a person apply for a public service. You upload your own documents, check the details we read from them, and pick a service. A browser assistant then fills the application on the portal for you. It stops and hands over to you for the OTP, the CAPTCHA and the final approval. At the end you get a tracking receipt and a full audit log of every step. This repository ships one service, a student scholarship, on a bundled fictional demo portal. Real portals are switched off.

> Independent assistant. Not affiliated with, or endorsed by, any government body.
>
> The bundled portal at `/demo-portal` is fictional and says so on every page: **FICTIONAL DEMO PORTAL - NOT A GOVERNMENT WEBSITE**. Nothing you submit there reaches any real office.

The product name lives in one file, `config/brand.ts`. Rename it there.

## How it works

1. **Upload.** You upload a marksheet, an income certificate and a fictional Demo ID card. We check the size and the real file type, refuse PDFs that show an Aadhaar number, and keep the files in a private folder for `RETENTION_HOURS` (default 24).
2. **Check.** If you allow it, an AI model reads your documents and suggests values. You confirm every field, or type it yourself. Eligibility is checked with fixed rules from the service definition. No model is involved in that check.
3. **We fill it.** You authorise this one application. The worker opens a fresh, private browser and follows the service's scripted workflow. If a page does not behave as expected, the model may suggest one action at a time, and a validator checks each one before it runs.

Human checkpoints: the assistant never answers a CAPTCHA or an OTP, and it never submits without your recorded final approval. At each checkpoint it waits for you for up to 10 minutes, then stops safely.

## Repository layout

| Path | What it holds |
| --- | --- |
| `apps/web` | Next.js app: public site, sign-in, onboarding, wizard, live run view, receipts, settings, legal pages, API routes, and the fictional `/demo-portal`. This is the Vercel root directory, so `vercel.json` lives here. |
| `apps/worker` | Agent worker: tiny HTTP server (`GET /health`, `POST /wake`), Postgres job loop, Playwright executor, document extraction, model adapter with record/replay fixtures. |
| `packages/shared` | Zod schemas, workflow and eligibility engines, action validator, egress allowlist, redaction, AES-256-GCM crypto, HMAC signing, environment schemas. |
| `supabase` | `migrations/*.sql`, the generated one-paste `schema.sql`, `seed.sql`, and `config.toml` for the Supabase CLI. |
| `config` | `brand.ts`, `services/scholarship_demo.json` (fields, documents, eligibility rules, workflow), `demo-portal-geo.json`. |
| `scripts` | `doctor`, `keygen`, `smoke`, `seed-demo`, `generate-sample-docs`, `build-schema`, `build-seed`. |
| `e2e` | Playwright specs: `agent.spec.ts`, `a11y.spec.ts`, `app.spec.ts` (full stack). |
| `fixtures/llm` | Model responses replayed in tests and CI. |
| `docs` | Deployment, security, privacy, incident response and architecture notes. |
| `Dockerfile.worker`, `docker-compose.yml` | Worker image and local / demo-day containers. |
| `.github/workflows/ci.yml` | Continuous integration. |

## Local quick start

You need Node.js 24 (22.12 is the minimum; `.nvmrc` pins 24) and npm. Docker is optional (needed for `npx supabase start` and `docker compose`).

```bash
npm ci
cp .env.example .env.local
npm run keygen        # prints ENCRYPTION_KEY, WORKER_SHARED_SECRET and CRON_SECRET; paste them into .env.local
```

Set up a database. Pick one:

- **Hosted Supabase project.** Create a project, open the SQL editor, paste the whole of `supabase/schema.sql` and run it. It creates the tables, policies, functions, the two private storage buckets and the service seed.
- **Local Supabase.** Run `npx supabase start`. It applies `supabase/migrations` and `supabase/seed.sql` for you (see `supabase/config.toml`) and prints the API URL and keys.

Fill in `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- `GRIEVANCE_EMAIL` and `SUPPORT_EMAIL`. The web app's environment check (`packages/shared/src/env.ts`) fails without them.
- `ANTHROPIC_API_KEY`, or `LLM_DISABLED=true` to run without any model (you type your details; recovery is rule-based), or `LLM_FIXTURES=replay` to use the recorded responses.
- Optional: `WORKER_URL=http://localhost:8080` so new runs wake the worker at once. Without it the worker still finds runs by polling (every 3 seconds while busy, every 30 seconds when idle).

Then:

```bash
npx playwright install chromium   # the worker drives Chromium
npm run dev                       # web app on http://localhost:3000
npm run dev:worker                # worker on http://localhost:8080, reads .env.local
npm run doctor                    # checks env, database, buckets, RLS and both health endpoints
```

Optional: `npm run sample-docs` writes clearly fictional sample documents to `./sample-docs` for you to upload.

## Commands

| Command | What it does |
| --- | --- |
| `npm run lint` | ESLint over the whole repo, zero warnings allowed. |
| `npm run typecheck` | `tsc --noEmit` for `packages/shared`, `apps/worker`, `apps/web` and `scripts`. |
| `npm run test` | Vitest unit tests in `packages/*/test` and `apps/*/test`. `npm run test:watch` keeps it running. |
| `npm run build` | `next build` for the web app, then the esbuild bundle of the worker (`apps/worker/dist/server.js`). |
| `npm run e2e` | All Playwright projects (`agent`, `a11y`, `app`). `npm run e2e:agent` runs only the agent project. |
| `npm run doctor` | Validates every variable with the shared Zod schemas, then checks Supabase connectivity, tables, the service seed, that both buckets exist and are private, RLS sanity for anonymous users, the worker's `/health` and the web app's `/api/health`. Prints what is missing and how to fix it. Exits 1 on any blocking problem. |
| `npm run keygen` | Prints fresh `ENCRYPTION_KEY`, `WORKER_SHARED_SECRET` and `CRON_SECRET`. |
| `npm run smoke` | End-to-end check of a deployed environment. See [DEPLOYMENT.md](docs/DEPLOYMENT.md#5-run-the-smoke-test). |
| `npm run seed:demo` | Upserts the bundled services and, if `DEMO_LOGIN_EMAIL` / `DEMO_LOGIN_PASSWORD` are set, creates the shared demo account with a fictional, confirmed profile and sample documents. |
| `npm run sample-docs` | Writes synthetic documents (watermarked SAMPLE, fictional names) to `./sample-docs`. |
| `npm run db:schema` | Rebuilds `supabase/schema.sql` and `supabase/seed.sql` from `supabase/migrations/*.sql` and `config/services/*.json`. Run it after changing either. |

Also available: `npm run format`, `npm run format:check` (Prettier) and `npm run db:seed-sql` (prints the seed SQL).

## Testing notes

- **Unit tests** (`npm run test`) cover crypto and key rotation, redaction and Aadhaar detection, the workflow and eligibility engines, the action validator, document extraction rules, fixture replay, prompt construction, cost estimates, colour contrast of the design tokens, English/Hindi message parity and the demo portal's validation.
- **The agent e2e runs without a database.** `npm run e2e:agent` starts the web app on port 3100 with `DEMO_PORTAL_STORE=memory` and a throwaway encryption key. The spec drives the worker's real executor and real Chromium through the demo portal, with an in-memory run store and either the model switched off or replayed model fixtures from `fixtures/llm`. It covers chaos mode (session expiry, slow dropdowns, popup, strict formats, injected instructions), every human checkpoint, idempotent resubmission, no submit without approval, refusing an unconfirmed value, and blocked egress. No API key is needed.
- **Accessibility** (`a11y.spec.ts`) runs axe on public screens in English and Hindi and checks 360px width.
- **The full-stack spec needs Supabase.** `app.spec.ts` is skipped unless `E2E_FULL_STACK=1`. It needs a Supabase project with the schema applied (local CLI or hosted), the worker running against the same project (`LLM_FIXTURES=replay` is fine) and the Supabase variables set. It covers sign-up, the under-18 block, the whole journey to a receipt in chaos mode, RLS isolation between two users, the retention job deleting expired documents, and account deletion removing every row and stored file.
- Run `npx playwright install chromium` once before the first e2e run.
- The replay fixtures in `fixtures/llm` were written by hand in the recorded format. They were not recorded from a live model. They cover recovery proposals only, so in replay mode document reading finds no fixture and the app asks the applicant to type those details. To re-record, run the worker with `LLM_FIXTURES=record` and a real `ANTHROPIC_API_KEY`, complete a chaos-mode demo run, then review `fixtures/llm/recorded.json`.

CI (`.github/workflows/ci.yml`) has three jobs: `checks` (npm ci, lint, typecheck, unit tests, web and worker build, `npm audit --omit=dev --audit-level=high`, gitleaks), `e2e` (Playwright `agent` and `a11y` projects against the in-memory demo portal, with model fixtures replayed), and `full-stack` (manual or nightly: Supabase CLI, the worker and `app.spec.ts`).

## Legal templates

> **Template - review with a lawyer before launch.**

The Privacy Policy, Terms of Use, Disclaimer, AI-use page and Grievance page (`apps/web/content/legal.ts`, `apps/web/app/(site)/*`) are templates. They use tokens such as `[LEGAL_ENTITY_NAME]`, `[LEGAL_ENTITY_ADDRESS]`, `[GRIEVANCE_OFFICER_NAME]` and `[JURISDICTION_CITY]`, set in `config/brand.ts`, and every legal page shows a template banner in the app. None of this is legal advice. `docs/INCIDENT_RESPONSE.md` is a template too.

## Documentation

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): a 30-minute deployment guide, troubleshooting, free-tier limits, cost.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): the three deployables, run states, the queue, the executor, the demo portal.
- [docs/SECURITY.md](docs/SECURITY.md): data-flow map and the security checklist mapped to code.
- [docs/PRIVACY_COMPLIANCE.md](docs/PRIVACY_COMPLIANCE.md): DPDP and other legal duties mapped to code, with known limits.
- [docs/INCIDENT_RESPONSE.md](docs/INCIDENT_RESPONSE.md): what to do when something goes wrong.
