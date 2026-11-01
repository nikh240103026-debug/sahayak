# Deploying Sahayak

This guide takes about 30 minutes. Follow the steps in order and copy the commands as they are.

You will set up three things:

1. **Supabase**: database, sign-in, file storage and live updates.
2. **Vercel**: the web app, which also hosts the fictional demo portal at `/demo-portal`.
3. **The worker**: a Docker container that runs the browser assistant.

Free-tier numbers below were checked on **2026-11-01**. They change often. Check them again before you launch.

## 0. Before you start

You need:

- A GitHub account, a Supabase account and a Vercel account.
- A place to run the worker: Render, Hugging Face Spaces, or a laptop with Docker for demo day.
- An Anthropic API key, or the decision to run without a model (`LLM_DISABLED=true`).
- Node.js 24 on your computer (22.12 is the minimum; `.nvmrc` pins 24).

On your computer, in the repository folder:

```bash
npm ci
cp .env.example .env.local
npm run keygen
```

`keygen` prints three lines: `ENCRYPTION_KEY`, `WORKER_SHARED_SECRET` and `CRON_SECRET`. Paste them into `.env.local`. Keep `ENCRYPTION_KEY` somewhere safe as well. Without it, stored profiles cannot be decrypted.

You will fill the rest of `.env.local` as you go. You will copy the same values into Vercel and into the worker host.

## 1. Supabase

### 1.1 Create the project

1. In Supabase, create a new project.
2. Choose the region **South Asia (Mumbai), `ap-south-1`**. Supabase lists it as an available region (checked 2026-11-01). If it is not offered to you, pick the nearest region.
3. Save the database password in your password manager.

### 1.2 Create the schema

1. Open **SQL Editor**, then **New query**.
2. Open `supabase/schema.sql` from this repository. Copy the whole file. Paste it in. Press **Run**.

This one file:

- creates every table, type, index and trigger, with row-level security on every table;
- creates the job-queue and rate-limit functions;
- creates two **private** storage buckets, `user-documents` (4 MB per file) and `run-artifacts` (10 MB per file), and their storage policies;
- adds `runs`, `run_steps` and `approvals` to the `supabase_realtime` publication for live progress;
- seeds the `scholarship_demo` service.

It is safe to run again. Re-run it whenever you pull changes to `supabase/migrations` or `config/services` (after `npm run db:schema`).

Check: **Storage** now shows `user-documents` and `run-artifacts`, both private.

### 1.3 Copy the keys

Open **Project Settings, API** and copy into `.env.local`:

| Supabase shows | Put it in |
| --- | --- |
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon` public key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` secret key | `SUPABASE_SERVICE_ROLE_KEY` |

The service-role key bypasses row-level security. It goes only into Vercel's server environment and the worker. Never put it in a `NEXT_PUBLIC_` variable.

If your dashboard shows "publishable" and "secret" keys instead, use the publishable key as the anon key and the secret key as the service-role key, and verify with `npm run doctor` in step 4.

### 1.4 Sign-in providers

1. Open **Authentication, Sign In / Providers**.
2. **Email**: enabled, with **Confirm email** turned on. Our sign-up form asks for at least 12 characters.
3. **Google** (optional): turn it on and paste a client ID and secret from the Google Cloud console. In Google, add the callback URL that Supabase shows on that page as an authorised redirect URI. Then set `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=true` in Vercel.

### 1.5 Site URL and redirect URL

Open **Authentication, URL Configuration**.

1. **Site URL**: your web app's address, for example `https://your-app.vercel.app`. If you do not know it yet, come back after step 2.
2. **Redirect URLs**: add `https://your-app.vercel.app/auth/callback`. For local work also add `http://localhost:3000/auth/callback`.

The app sends confirmation and password-reset links to `<site>/auth/callback?next=...`. When a requested redirect is not on the list, Supabase falls back to the Site URL, and the link appears to "do nothing".

### 1.6 Custom SMTP (recommended)

Supabase's built-in email is for testing only. On 2026-11-01 its docs said it sends about **2 messages per hour**, only to addresses in your Supabase organisation, with no delivery guarantee. Real users will not receive sign-up emails.

Use any SMTP provider:

1. Create an account with an SMTP email provider and verify your sending domain there (it will ask you to add SPF and DKIM DNS records).
2. From the provider, note: **host**, **port** (usually 587 for STARTTLS, or 465 for TLS), **username**, **password** (often an API key), and a **sender address** such as `no-reply@your-domain`.
3. In Supabase, open **Authentication, Emails, SMTP Settings**, turn on custom SMTP, and fill in host, port, username, password, sender email and sender name.
4. With custom SMTP, Supabase's default limit was 30 emails per hour (2026-11-01). Raise it under **Authentication, Rate Limits** if you need more.
5. Sign up once with your own address to test it.

## 2. GitHub and Vercel

### 2.1 Push to GitHub

Create a private GitHub repository and push this code to it. `.env.local` is in `.gitignore`, so your secrets stay on your computer. CI runs gitleaks on every push to catch mistakes.

### 2.2 Import into Vercel

1. In Vercel, choose **Add New, Project** and import the repository.
2. **Root Directory**: `apps/web`.
3. Turn on **Include files outside the root directory in the Build Step**. The web app imports `packages/shared` and `config/` from outside `apps/web`.
4. Framework preset: Next.js. Leave the build and install commands at their defaults.
5. In **Settings, General**, pick **Node.js 24.x** (the PDF reader package asks for Node 24; the repo needs at least 22.12).

### 2.3 Environment variables

Add these in **Settings, Environment Variables** (Production, and Preview if you use it):

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | `https://your-app.vercel.app` (no trailing slash) |
| `NEXT_PUBLIC_SUPABASE_URL` | from step 1.3 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from step 1.3 |
| `SUPABASE_SERVICE_ROLE_KEY` | from step 1.3 |
| `ENCRYPTION_KEY` | from `npm run keygen` |
| `ENCRYPTION_KEY_VERSION` | `1` |
| `ENCRYPTION_PREVIOUS_KEYS` | leave empty (used for key rotation) |
| `WORKER_SHARED_SECRET` | from `npm run keygen` |
| `CRON_SECRET` | from `npm run keygen` |
| `WORKER_URL` | leave empty for now; set in step 4 |
| `DEMO_PORTAL_BASE_URL` | same as `NEXT_PUBLIC_SITE_URL` |
| `ALLOWED_PORTAL_HOSTS` | leave empty (the demo portal host is always allowed) |
| `ENABLE_REAL_PORTALS` | `false` |
| `LLM_PROVIDER` | `anthropic` (the legal pages name the provider from this) |
| `LLM_DISABLED` | `false`, or `true` to run without a model |
| `RETENTION_HOURS` | `24` |
| `MAX_RUNS_PER_USER_PER_DAY` | `5` |
| `GRIEVANCE_EMAIL` | your grievance officer's address (required) |
| `SUPPORT_EMAIL` | your support address (required) |
| `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH` | `false` unless you did step 1.4 Google |
| `NEXT_PUBLIC_ENABLE_DEMO_LOGIN` | `false` (see "Demo account for judges" below) |
| `DEMO_LOGIN_EMAIL`, `DEMO_LOGIN_PASSWORD` | only with the demo login |

Leave `DEMO_PORTAL_STORE` unset in deployments; `memory` is for local tests only. `SENTRY_DSN` is accepted by the environment schema but nothing in the code sends to it yet.

`NEXT_PUBLIC_*` values are built into the pages. After changing one, redeploy.

### 2.4 Deploy

Press **Deploy**. When it finishes, open `https://your-app.vercel.app/api/health`. You should see `{"ok":true,"db":"ok",...}`. If the address differs from what you guessed, update `NEXT_PUBLIC_SITE_URL`, `DEMO_PORTAL_BASE_URL` and Supabase's Site URL and redirect URL, then redeploy.

### 2.5 What `vercel.json` does

`apps/web/vercel.json` (it lives in `apps/web` because that is Vercel's root directory):

- sets `maxDuration` to 30 seconds for every route handler and page. The retention cron route sets its own 60 seconds. On 2026-11-01 Vercel's docs gave Hobby functions a 300-second default and maximum with Fluid compute, so both values fit.
- defines two daily crons:
  - `/api/health` at 03:00 UTC. It calls a database ping, so a free Supabase project sees activity every day.
  - `/api/cron/retention` at 03:30 UTC. It deletes expired documents, screenshots and practice-portal data. Vercel calls it with the header `Authorization: Bearer $CRON_SECRET` when `CRON_SECRET` is set in the project; the route rejects any other caller with 401.
  - **Hourly cleanup (recommended):** Vercel's free plan only runs crons once a day, so a document could outlive `RETENTION_HOURS` by up to a day. The workflow `.github/workflows/retention.yml` calls the same route every hour. In GitHub, open **Settings, Secrets and variables, Actions** and add the secrets `SITE_URL` (your Vercel URL, no trailing slash) and `CRON_SECRET` (same value as in Vercel). You can also run it by hand from the Actions tab.

On Hobby, crons run at most once a day and may fire anywhere within the scheduled hour.

### 2.6 A note on Vercel Hobby

Vercel's Hobby plan is for **non-commercial personal use only**. Use it only for the buildathon, a demo or a portfolio. Any commercial use, including paid work on the project, needs a plan that allows it. Read Vercel's fair-use guidelines before you launch.

## 3. The worker

The worker is the container built from `Dockerfile.worker`. It runs as the non-root `pwuser`, listens on `$PORT` (default 8080), and answers only `GET /health` and `POST /wake`. It picks up work from the database, one run at a time.

The build context is the **repository root**: the Dockerfile copies `package.json`, `package-lock.json`, `tsconfig.base.json`, `config/`, `fixtures/`, `packages/shared`, `apps/worker` and `apps/web/package.json`.

### Worker environment

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | from step 1.3 |
| `SUPABASE_SERVICE_ROLE_KEY` | from step 1.3 |
| `ENCRYPTION_KEY`, `ENCRYPTION_KEY_VERSION`, `ENCRYPTION_PREVIOUS_KEYS` | same as Vercel |
| `WORKER_SHARED_SECRET` | same as Vercel |
| `DEMO_PORTAL_BASE_URL` | your web app, `https://your-app.vercel.app` |
| `ALLOWED_PORTAL_HOSTS` | empty |
| `ENABLE_REAL_PORTALS` | `false` |
| `LLM_PROVIDER` | `anthropic` |
| `ANTHROPIC_API_KEY` | your key (not needed with `LLM_DISABLED=true`) |
| `LLM_MODEL_AGENT`, `LLM_MODEL_FAST` | as in `.env.example`, or the models you prefer |
| `LLM_DISABLED` | same as Vercel |
| `LLM_FIXTURES` | `off` |
| `RETENTION_HOURS` | `24` |

Optional tuning, with defaults: `RUN_TIMEOUT_MINUTES=15`, `HUMAN_WAIT_MINUTES=10` (10 is also the maximum), `POLL_INTERVAL_MS=3000`, `IDLE_POLL_INTERVAL_MS=30000`, `WORKER_ID` (defaults to hostname plus a random suffix), `LOG_LEVEL=debug`. Do not set `PORT` unless your host asks you to.

The browser on the worker may only open `DEMO_PORTAL_BASE_URL`'s host, and only under `/demo-portal`. It must be `https://` unless the host is `localhost`.

### Option A: Render (free Docker web service)

1. In Render, choose **New, Web Service** and connect your GitHub repository.
2. Runtime: **Docker**. Dockerfile path: `./Dockerfile.worker`. Docker build context: `.` (the repository root).
3. Instance type: **Free**.
4. Health check path: `/health`.
5. Add every variable from the table above under **Environment**.
6. Create the service and wait for the build. Render passes the port in `PORT`, and the worker listens on it.
7. Copy the service URL, for example `https://your-worker.onrender.com`. That is your `WORKER_URL`.

Warnings:

- **Memory.** On 2026-11-01 Render listed the free instance at 512 MB RAM and 0.1 CPU. Chromium needs a lot of memory, and this may be too small. If the worker restarts in the middle of runs or logs out-of-memory errors, move to a larger instance, or use Option B or C.
- **Sleeping.** A free service spins down after 15 minutes without inbound traffic and takes about a minute to wake. The web app's `/wake` call wakes it, and the app shows "Warming up the assistant…" meanwhile. A run that stays waiting at checkpoints for a long time can cross that 15-minute window. If the instance sleeps mid-run, the worker marks that run `PAUSED_EXPIRED` when it wakes again, and the applicant can restart it. Nothing is submitted without a receipt.
- Free instances get 750 hours a month per workspace.

### Option B: Hugging Face Spaces (Docker Space)

Check first: on 2026-11-01 Hugging Face's docs said **creating a Docker Space needs a paid plan** (PRO for personal accounts). The CPU Basic hardware (2 vCPU, 16 GB RAM) has no hourly cost, and its memory suits Chromium well.

1. Create a new Space. SDK: **Docker**. Hardware: **CPU Basic**. Visibility: **Public** or **Protected**. A **Private** Space hides the app from Vercel, so `/wake` and `npm run doctor` cannot reach it (the worker would still work through polling).
2. Clone the Space repository next to this repository and copy in what the image needs. Do not copy `node_modules`.

   ```bash
   git clone https://huggingface.co/spaces/<you>/<space> hf-worker
   cd hf-worker
   SRC=../<this-repo>
   cp $SRC/Dockerfile.worker Dockerfile
   cp $SRC/package.json $SRC/package-lock.json $SRC/tsconfig.base.json .
   cp -r $SRC/config $SRC/fixtures .
   mkdir -p packages apps/web apps/worker
   cp -r $SRC/packages/shared packages/
   cp -r $SRC/apps/worker/src $SRC/apps/worker/package.json $SRC/apps/worker/build.mjs $SRC/apps/worker/tsconfig.json apps/worker/
   cp $SRC/apps/web/package.json apps/web/
   ```

   Hugging Face builds the file named `Dockerfile` at the root of the Space repository, which is why we copy `Dockerfile.worker` to that name.
3. Replace the Space's `README.md` header so the Space uses our port:

   ```yaml
   ---
   title: Sahayak worker
   sdk: docker
   app_port: 8080
   ---
   ```

   `app_port` must match the port the worker listens on. The image sets `PORT=8080`; do not add a different `PORT` secret.
4. In the Space's **Settings, Variables and secrets**, add every variable from the table above as a **Secret**. Docker Spaces get secrets as environment variables at runtime.
5. Commit and push: `git add . && git commit -m "worker" && git push`.
6. When the build finishes, open `https://<you>-<space>.hf.space/health`. That base address is your `WORKER_URL`.

Notes: Hugging Face runs Docker Spaces as user ID 1000. Our image only reads its own files, so this should not matter; if the logs show a permission error, look there first. Free hardware sleeps after a period without use; the docs did not state the length on 2026-11-01, so verify it.

### Option C: demo-day fallback on a laptop

If the hosted worker misbehaves on demo day, run it on a laptop with Docker, pointed at the same Supabase project.

1. Put the production values in `.env.local` on the laptop (Supabase URL and service-role key, `ENCRYPTION_KEY`, `WORKER_SHARED_SECRET`, model settings).
2. `docker-compose.yml` sets `DEMO_PORTAL_BASE_URL` for the container from `DEMO_PORTAL_BASE_URL_FOR_DOCKER`. Point it at your deployed web app:

   ```bash
   # macOS / Linux / Git Bash
   DEMO_PORTAL_BASE_URL_FOR_DOCKER=https://your-app.vercel.app docker compose up worker
   ```

   ```powershell
   # Windows PowerShell
   $env:DEMO_PORTAL_BASE_URL_FOR_DOCKER = "https://your-app.vercel.app"; docker compose up worker
   ```
3. Vercel cannot reach your laptop, so `/wake` will fail quietly. That is fine: the worker polls the database. For snappier pickup on demo day, add `IDLE_POLL_INTERVAL_MS=3000` to the laptop's `.env.local`.
4. Several workers can run against one database at once. The queue uses `FOR UPDATE SKIP LOCKED`, so a run is claimed by exactly one of them.

The compose file already gives the container 1 GB of shared memory (`shm_size`), and the worker starts Chromium with `--disable-dev-shm-usage`.

## 4. Connect the web app to the worker

1. In Vercel, set `WORKER_URL` to the worker's base address (no trailing path).
2. Redeploy the web app.
3. On your computer, put the production values in `.env.local` and run:

   ```bash
   npm run doctor
   ```

`doctor` validates every variable for the web app and the worker, pings the database, checks every table, the service seed, that both buckets exist and are private, that anonymous users can neither read nor write protected tables, the worker's `/health` (it waits up to 60 seconds for a sleeping host) and the web app's `/api/health`. It prints each problem with a fix and exits with code 1 if anything blocks a working deployment.

## 5. Run the smoke test

```bash
npm run smoke
```

It reads `.env.local` and needs `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and the deployed `ENCRYPTION_KEY`; with `WORKER_URL` and `WORKER_SHARED_SECRET` it also checks and wakes the worker. It:

1. checks the web app's `/api/health` and the worker's `/health`;
2. creates a confirmed test user `smoke-<timestamp>@example.com` through the Supabase admin API, with the fictional sample profile, consents and sample documents (it does not use the sign-up form, so it does not test email);
3. creates one authorised run on the demo portal;
4. answers the CAPTCHA, the OTP and the final approval the way the applicant would;
5. checks the receipt has a tracking ID like `DEMO-SCH-2026-00042` and a stored PDF;
6. deletes the test user and everything it created. Pass `npm run smoke -- --keep` to keep it.

Then do one real pass by hand: sign up in a browser with your own email, confirm it, complete onboarding, upload the files from `npm run sample-docs`, and run the application through to the receipt.

## 6. Troubleshooting

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| "Warming up the assistant…" for a long time | The free worker host is asleep (cold start), `WORKER_URL` is wrong, or `/wake` is rejected | Open `WORKER_URL/health` in a browser to wake it. Check `WORKER_URL` in Vercel. `/wake` answers 401 when `WORKER_SHARED_SECRET` differs between Vercel and the worker, or when the two clocks are more than 5 minutes apart. Without a working wake, the worker still finds the run within `IDLE_POLL_INTERVAL_MS` (30 s). |
| Runs stay "Queued" and never start | The worker is not running or is sleeping | Check the worker's logs on its host. Run `npm run doctor`. |
| Sign-up emails never arrive, or "too many attempts" | Supabase's built-in email limit, or our own limit | Set up custom SMTP (step 1.6) and raise Supabase's email rate limit. Our sign-in, sign-up and reset forms also allow 20 attempts per hour per IP and 8 per hour per email address. |
| Email link opens the home page, or says the link expired | Redirect URL not allowed, or wrong Site URL | Add `<site>/auth/callback` under Redirect URLs, check the Site URL, and check `NEXT_PUBLIC_SITE_URL` matches the real address. Links work once and expire; request a new one. |
| Browser console shows CSP or CORS errors | The page tried to reach an origin we do not allow | The CSP allows only our own origin and the Supabase project (HTTPS and WSS). Check `NEXT_PUBLIC_SUPABASE_URL` is the exact project URL and redeploy after changing it. Do not add third-party scripts or fonts. The browser never calls the worker, so there is no CORS to configure for it. |
| Worker logs "Target closed", crashes or restarts during runs | Chromium ran out of memory or shared memory | Use a larger instance. In Docker, give the container more shared memory (`shm_size: 1gb` in `docker-compose.yml`, or `--shm-size=1g`). The worker already passes `--disable-dev-shm-usage` to Chromium. |
| Run stops with "The assistant stopped unexpectedly" | The worker slept or restarted mid-run; its lease lapsed | The run is `PAUSED_EXPIRED` and nothing was submitted unless a receipt exists. Restart it from the run page. Keep the worker awake (or use a host that does not sleep) for demos. |
| Run fails with "The portal address is not on the allowed list" | `DEMO_PORTAL_BASE_URL` on the worker is wrong | Set it to the web app's `https://` address. Plain `http://` is allowed only for `localhost`, `127.0.0.1`, `[::1]` and `*.localhost`. |
| The live view does not update by itself | Realtime is not set up, or WebSockets are blocked | The page falls back to polling every 2 seconds and shows "Live updates paused. We are checking every few seconds instead." To fix Realtime, re-run `supabase/schema.sql`, or add `runs`, `run_steps` and `approvals` to the `supabase_realtime` publication in **Database, Publications**. |
| Vercel build cannot find `@app/shared` or `config/` | Files outside the root directory are excluded | Turn on **Include files outside the root directory in the Build Step** (step 2.2). |
| Retention cron logs 401 | `CRON_SECRET` missing or different in Vercel | Set `CRON_SECRET` in Vercel's environment and redeploy. |
| Supabase project is paused | Free projects pause after 7 days of inactivity | Restore it in the dashboard. The daily `/api/health` cron is there to prevent this; check it is listed under the project's Cron Jobs. |
| `doctor` says anonymous users can read a table | Row-level security is missing | Re-run `supabase/schema.sql`. |

## 7. Free-tier limits

Checked on **2026-11-01** from the providers' own pages. Re-verify every number before launch.

| Provider | Limit | Value on 2026-11-01 |
| --- | --- | --- |
| Vercel Hobby | Use | Non-commercial personal use only |
| Vercel Hobby | Function duration | 300 s default and maximum (Fluid compute) |
| Vercel Hobby | Function memory | 2 GB, 1 vCPU |
| Vercel Hobby | Request or response body | 4.5 MB |
| Vercel Hobby | Cron jobs | 100 per project, at most once a day, timing within the scheduled hour |
| Vercel Hobby | Monthly usage guideline | 1,000,000 function invocations, 4 h active CPU, 100 GB fast data transfer |
| Supabase Free | Database | 500 MB |
| Supabase Free | File storage | 1 GB |
| Supabase Free | Monthly active users | 50,000 |
| Supabase Free | Egress | 5 GB, plus 5 GB cached |
| Supabase Free | Projects | 2 active |
| Supabase Free | Inactivity | Paused after 7 days |
| Supabase Auth | Built-in email | About 2 per hour, team addresses only, testing only |
| Supabase Auth | Custom SMTP default | 30 emails per hour (adjustable) |
| Render Free | Instance | 512 MB RAM, 0.1 CPU |
| Render Free | Sleep | After 15 min without inbound traffic; about 1 min to wake |
| Render Free | Hours | 750 per workspace per month |
| Hugging Face | Docker Space | Needs a paid plan to create (PRO for personal accounts) |
| Hugging Face | CPU Basic hardware | 2 vCPU, 16 GB RAM, 50 GB non-persistent disk, no hourly cost |
| Hugging Face | Sleep | Free hardware sleeps when unused; length not stated (verify before launch) |
| Anthropic | Model API | No free tier assumed; usage is billed (verify current pricing before launch) |

Sources: [Vercel function limits](https://vercel.com/docs/functions/limitations), [Vercel cron usage](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Vercel fair use](https://vercel.com/docs/limits/fair-use-guidelines), [Supabase pricing](https://supabase.com/pricing), [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Supabase regions](https://supabase.com/docs/guides/platform/regions), [Render free](https://render.com/docs/free), [Render instance types](https://render.com/docs/compute-plans), [Hugging Face Spaces](https://huggingface.co/docs/hub/spaces-overview), [Docker Spaces](https://huggingface.co/docs/hub/spaces-sdks-docker).

## 8. Cost and usage

The model API is the only part you cannot run for free. Everything else fits the free tiers above for a demo.

How spend is capped in the code:

- `MAX_RUNS_PER_USER_PER_DAY` (default 5): `createRun` in `apps/web/lib/runs.ts` refuses a new application when the user has started that many in the last 24 hours.
- `LLM_DISABLED=true` is the kill switch. The web app starts new runs in manual-entry mode, and the worker makes no model calls at all; it uses its rule-based recovery only.
- People who did not give AI consent never cause model calls.
- The model is called only when needed: once per document for extraction (with `LLM_MODEL_FAST`), and for recovery only when a scripted step fails (with `LLM_MODEL_AGENT`), at most 6 proposed actions per recovery and 3 retries per step.

How to see spend:

- Each run keeps a running total in `runs.llm_usage`: `calls`, `input_tokens`, `output_tokens`, `cost_usd`.
- Each model call is also logged by the worker as a JSON line `"msg":"llm call"` with tokens, model and `cost_usd`.
- The cost estimate uses the prices in `apps/worker/src/llm/pricing.ts`. Check them against your provider's price list; a model not listed there is logged with `cost_usd: null`.

A daily total, from the Supabase SQL editor:

```sql
select date_trunc('day', created_at) as day,
       sum((llm_usage->>'calls')::int) as calls,
       sum((llm_usage->>'cost_usd')::numeric) as cost_usd
from public.runs
group by 1
order by 1 desc;
```

There is no global spend cap in the code. Set a monthly spend limit in your model provider's console as well.

## Demo account for judges (optional)

1. Set `DEMO_LOGIN_EMAIL` and `DEMO_LOGIN_PASSWORD` (12+ characters) in `.env.local` and in Vercel.
2. Run `npm run seed:demo`. It creates the account with a fictional, confirmed profile, consents and sample documents.
3. Set `NEXT_PUBLIC_ENABLE_DEMO_LOGIN=true` in Vercel and redeploy. The sign-in page shows a clearly labelled demo shortcut.

The sample documents expire after `RETENTION_HOURS` like any upload. Run `npm run seed:demo` again on the morning of the demo. Turn the shortcut off afterwards.

## Local development

### With the Supabase CLI (recommended)

```bash
npx supabase start
```

It needs Docker. It applies `supabase/migrations` and `supabase/seed.sql` automatically (see `supabase/config.toml`), turns on email confirmations, and allows `http://localhost:3000/auth/callback` as a redirect. It prints the API URL (`http://127.0.0.1:54321`), the anon and service-role keys, the Studio address (port 54323) and a local mail viewer where confirmation emails land.

Put the URL and keys in `.env.local`, keep `NEXT_PUBLIC_SITE_URL` and `DEMO_PORTAL_BASE_URL` at `http://localhost:3000`, and run:

```bash
npx playwright install chromium
npm run dev
npm run dev:worker
```

### With docker compose

`docker-compose.yml` has two services:

- `worker`: built from `Dockerfile.worker`, reads `.env.local`, publishes port 8080, 1 GB shared memory.
- `web` (profile `full`): Node 24 running `npm ci` and the Next.js dev server on port 3000, with the repository mounted.

```bash
docker compose up worker              # worker only
docker compose --profile full up      # web and worker
```

With a local Supabase, the compose file's comments suggest `NEXT_PUBLIC_SUPABASE_URL=http://host.docker.internal:54321` for the containers.

Inside compose, the worker's `DEMO_PORTAL_BASE_URL` defaults to `http://host.docker.internal:3000`, the web app running on your machine. The egress allowlist allows plain `http://` only for local development hosts (`localhost`, `127.0.0.1`, `[::1]`, `*.localhost` and `host.docker.internal`); every other host must use `https://`. To point a containerised worker at a deployed web app instead, set `DEMO_PORTAL_BASE_URL_FOR_DOCKER` to its `https://` address, as in Option C.
