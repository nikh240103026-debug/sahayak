# Architecture

This page explains how the pieces fit together. File paths are relative to the repository root.

## Three deployables

A browser agent cannot run inside short-lived serverless functions, so the system has three parts.

```
  Citizen's browser
       |   HTTPS pages and forms
       |   Supabase Realtime (RLS-protected), with polling fallback
       v
  Next.js web app  (Vercel, apps/web)  ---- also hosts the fictional /demo-portal
       |   server actions and route handlers (service role, server only)
       |   POST {WORKER_URL}/wake  (HMAC-signed nudge)
       v
  Supabase  (free tier): Auth + Postgres + Storage + Realtime
       ^   claim runs, write steps, upload screenshots and receipts
       |
  Agent worker  (Docker container, apps/worker)  ->  Playwright Chromium + model
       |   egress allowlist only
       v
  Demo portal  (/demo-portal on the web app; real portals only if enabled)
```

- **Web app** (`apps/web`): the UI, sign-in, onboarding, wizard, live run view, approvals, receipts, settings, legal pages, the API routes, and the fictional demo portal.
- **Supabase**: identity, data, private files and live updates. Postgres is also the job queue. There is no Redis.
- **Worker** (`apps/worker`): a plain Node HTTP server with two endpoints and a job loop. It drives Chromium and calls the model.
- **Shared code** (`packages/shared`): schemas, the workflow and eligibility engines, the validator, egress rules, redaction and crypto, used by all three and by the scripts. `index.ts` is safe for the browser; `crypto`, `hmac` and `env` are server-only.

## Run status machine

The same rules live in two places, and must be kept in sync: `TRANSITIONS` and `canTransition` in `packages/shared/src/schemas.ts` (used by the in-memory test store), and `run_status_transition_ok` with the `runs_status_guard` trigger in `supabase/migrations/20261101000300_functions.sql` (enforced by the database on every update).

```
                     reread documents
             +-----------------------------------+
             v                                   |
 QUEUED --> EXTRACTING --> NEEDS_PROFILE_CONFIRM-+
   |                         ^     |
   +---- manual entry -------+     | applicant authorises this run
                                   v
                FAILED -------> PLANNING <------- PAUSED_EXPIRED
              (restart)            |                (restart)
                                   v
                 +---------> EXECUTING <---------> AWAITING_HUMAN
                 |                 |              (CAPTCHA, OTP, pause)
                 |                 v
                 |   AWAITING_FINAL_APPROVAL --> SUBMITTING --> COMPLETED
                 |
   PLANNING, EXECUTING and AWAITING_FINAL_APPROVAL can go back to
   NEEDS_PROFILE_CONFIRM (missing value, stuck page, "change something").

   From any state except COMPLETED and CANCELLED: -> FAILED, CANCELLED, PAUSED_EXPIRED
```

| Transition | Who does it | Code |
| --- | --- | --- |
| new run -> `QUEUED`, or straight to `NEEDS_PROFILE_CONFIRM` when the user chose manual entry, has no AI consent, or `LLM_DISABLED=true` | Web app | `apps/web/lib/runs.ts` (`createRun`) |
| `QUEUED` -> `EXTRACTING` -> `NEEDS_PROFILE_CONFIRM` | Worker | `apps/worker/src/extraction.ts` |
| `NEEDS_PROFILE_CONFIRM` -> `QUEUED` (read new documents) | Web app | `rereadDocuments` |
| `NEEDS_PROFILE_CONFIRM`, `FAILED`, `PAUSED_EXPIRED` -> `PLANNING` | Web app, after the per-run authorisation, consent, plan and eligibility checks | `startRun` |
| `PLANNING` -> `EXECUTING` and onwards | Worker | `apps/worker/src/executor/executor.ts` |
| -> `CANCELLED` | Web app directly when no worker holds the run; otherwise the worker, on `control = 'cancel'` | `controlRun`, `checkControl` |
| active -> `PAUSED_EXPIRED` | Worker: checkpoint or pause over 10 minutes, the 15-minute run timeout, or a lapsed lease | `executor.ts`, `expire_stale_runs` |

The trigger adds three rules on top of the transition table:

- `SUBMITTING` is refused unless the run has an `approvals` row of kind `final_submit` with decision `approved`.
- `PLANNING` is refused unless `authorized_at` is set.
- Terminal states (`COMPLETED`, `FAILED`, `CANCELLED`, `PAUSED_EXPIRED`) stamp `finished_at` and clear the lease.

`COMPLETED` and `CANCELLED` are final. `FAILED` and `PAUSED_EXPIRED` can be restarted.

## Job queue, leases and heartbeats

All in `supabase/migrations/20261101000300_functions.sql` (service role only) and `apps/worker/src/loop.ts`.

- **`claim_next_run(worker_id, lease_seconds)`** picks the oldest run that is `QUEUED`, or `PLANNING` with `authorized_at`, whose lease is empty or expired and which is not being cancelled. It uses `FOR UPDATE SKIP LOCKED`, so several workers can poll safely. It sets `worker_id`, a lease of 120 seconds, bumps `attempt`, and sets `started_at`.
- **Heartbeat.** While a run is processing, the worker calls `extend_run_lease` every 30 seconds. It returns false if another worker owns the run.
- **`expire_stale_runs(grace_seconds)`.** About once a minute the loop marks runs `PAUSED_EXPIRED` that are `EXTRACTING`, `EXECUTING`, `AWAITING_HUMAN`, `AWAITING_FINAL_APPROVAL` or `SUBMITTING` and whose lease ended more than 120 seconds ago. Their error text says nothing was submitted unless the receipt says so. A run still in `PLANNING` with a lapsed lease is simply claimed again.
- **Polling.** The loop handles one run at a time (Chromium is heavy on free hosts). It polls every `POLL_INTERVAL_MS` (3 s) while active: for a minute after start, and for 10 minutes after a `/wake` or a claim. Otherwise it polls every `IDLE_POLL_INTERVAL_MS` (30 s). After finishing a run it polls again at once.
- **Browser.** One Chromium process, launched with `--disable-dev-shm-usage` and reused. Each run gets a new browser context, which is closed afterwards.

## Wake-up flow

Free hosts sleep when idle.

1. When the web app creates a run, starts one or re-reads documents, it calls `wakeWorker()` (`apps/web/lib/worker.ts`). This sends `POST {WORKER_URL}/wake` with `x-worker-signature: t=<unix seconds>,v1=<HMAC-SHA256>` over the body, using `WORKER_SHARED_SECRET`. It waits at most 4 seconds and never blocks the user: the run is already in the queue.
2. The worker checks the signature and that the timestamp is within 5 minutes (`packages/shared/src/hmac.ts`), then switches the loop to its fast polling window and polls at once.
3. While the run is `QUEUED`, the run page shows "Warming up the assistant…" and explains it can take up to a minute.
4. If `WORKER_URL` is empty or the call fails, the worker still finds the run on its next poll.

## Live progress

- The worker writes each step to `run_steps` (with an optional screenshot in `run-artifacts`) and updates `runs` and `approvals`.
- The run page (`apps/web/components/run-view.tsx`) subscribes to Supabase Realtime `postgres_changes` for `run_steps` inserts, `runs` updates and `approvals` changes on this run. The publication is set up in `supabase/migrations/20261101000400_storage_realtime.sql`; RLS limits events to the owner.
- Every event triggers a fetch of `/api/runs/[id]/state` (`apps/web/lib/run-state.ts`), which assembles the view as the signed-in user: steps, a 120-second signed URL for the latest screenshot, and the open checkpoint.
- While the run is active, the page also polls that endpoint: every 10 seconds when Realtime is connected, every 2 seconds when it is not (with a notice).
- The newest step is announced in an ARIA live region.

## Human pauses

All waits are bounded by `HUMAN_WAIT_MINUTES` (default 10, and the schema refuses more than 10).

- **CAPTCHA and OTP** (`human` actions in the workflow). The worker reads the question text (redacted), takes a screenshot with the input highlighted, sets `AWAITING_HUMAN` and creates an `approvals` row that expires in 10 minutes. The applicant answers in the checkpoint modal; `resolveApproval` stores the answer encrypted in `approval_responses`. The worker polls every 2 seconds, reads the answer, deletes it, types it and returns to `EXECUTING`. If the portal rejects the answer and asks again, the worker refills any cleared fields and hands over again. For the demo OTP, the checkpoint screen reads the portal's "SMS" through `/api/runs/[id]/demo-sms`, which answers only while that run has an open OTP checkpoint.
- **Final approval.** Before the submit step the worker reads the portal's own preview, checks every typed value appears in it, and creates a `final_submit` approval with masked values and any mismatches. The review screen rebuilds the full values server-side for the owner. Approve: the worker re-reads the recorded approval from the database, then submits. "Change something": the run returns to `NEEDS_PROFILE_CONFIRM` and nothing is submitted.
- **Pause button.** Sets `control = 'pause'`; the worker moves to `AWAITING_HUMAN` between actions and waits up to 10 minutes for Resume.
- **Timeouts.** A checkpoint or pause past 10 minutes ends as `PAUSED_EXPIRED` and the browser context is closed. The whole run has a hard limit of `RUN_TIMEOUT_MINUTES` (15). Cancel works between actions and during waits, but not while `SUBMITTING`.

## The hybrid executor

`apps/worker/src/executor/executor.ts`, driven by the service's workflow JSON (`config/services/scholarship_demo.json`).

**Deterministic first.** Each workflow step lists actions with fixed selectors and labels: `goto`, `fill`, `select`, `click`, `check`, `upload`, `human`, `approve`, `submit`. Fills type only confirmed profile values, formatted as the step asks (for example `dd/mm/yyyy` or `upper`). Selects match option labels and can wait for dependent dropdowns to fill. Uploads attach the user's stored file after checking its SHA-256. A step is done when its URL condition holds.

**When something goes wrong:**

1. If the portal has signed us out (the URL matches `sessionExpired`), the executor runs the login step again (at most 3 times per run) and redoes the current step.
2. Otherwise it reads the portal's error messages (`errorSelector`), logs them, and tries to recover. A step gets at most 3 retries; then the run stops with `NEEDS_PROFILE_CONFIRM` and a message saying we stopped instead of guessing.
3. **Recovery with the model** (only if the model is enabled and the user gave AI consent): the worker takes a role/label accessibility snapshot of the page (`executor/snapshot.ts`; each element gets a `ref`, sensitive input values are masked). The model proposes **one** action from a fixed schema: `goto | click | fill | select | check | upload | press | wait | request_human | finish`. The validator (`packages/shared/src/validator.ts`) checks it against the current step's field map, the allowed controls, the egress allowlist and the confirmed profile. Rejections are logged and fed back. At most 6 proposals per recovery.
4. **Built-in recovery** (no model, or the model call fails): close a notice dialog, or retype a field named in the error message using the next format variant of its confirmed value.

**Formats are named, so sensitive values never reach the model.** For each field in the step, the model sees format names and value shapes, for example `dd/mm/yyyy=99/99/9999` for a sensitive date (`describeVariant` in `packages/shared/src/values.ts`). It answers with a field key and a format name; the executor computes the value from the confirmed profile. Values of non-sensitive fields are shown as they are.

**Submitting.** Only in the `submit` phase, only after a recorded approval. The submit request carries the run's `Idempotency-Key`; if a receipt already exists, the worker does not submit again.

**The model adapter** (`apps/worker/src/llm/`): a provider-neutral `LLMClient`; Anthropic is the adapter. Outputs are JSON-schema-validated (Zod), with a 60-second timeout, SDK retries with backoff, and up to two extra attempts when output does not parse. `LLM_MODEL_FAST` reads documents; `LLM_MODEL_AGENT` proposes actions. Token use and estimated cost are logged per call and summed per run in `runs.llm_usage`. With `LLM_FIXTURES=replay` the worker uses recorded responses keyed by step and page situation (`llm/fixtures.ts`); `record` wraps the real client and writes `recorded.json`.

## Extraction pipeline

`apps/worker/src/extraction.ts`, for runs in `QUEUED`.

1. Status `EXTRACTING`. The model is used only if the run is not manual, the model is enabled, and the user's latest `ai_processing` consent is a grant. Otherwise documents are marked `skipped` and the user types their details.
2. For each required document: a PDF with a text layer (40+ characters) is checked for Aadhaar (and deleted if found), then sent as masked text, capped at 20,000 characters. A scanned PDF or an image is sent as it is.
3. The model returns only the keys the document definition asks for, each with a value or null and a confidence. If it reports an Aadhaar card, the file is deleted and the extraction marked `rejected`.
4. Results are stored encrypted in `documents.extracted_enc`. Nothing is confirmed yet.
5. Status `NEEDS_PROFILE_CONFIRM`. The confirm screen builds one suggestion per field from the documents, in each field's `sources` order, normalised to canonical form (`suggestProfile` in `packages/shared/src/workflow.ts`), with confidence hints. The user confirms or edits every field.
6. Eligibility is checked deterministically from the rules JSON (`packages/shared/src/eligibility.ts`): pass, fail or unknown per rule, plus missing documents. No model.

## The demo portal

`apps/web/app/demo-portal/**` and `apps/web/lib/demo-portal/**`: the fictional "Rajya Chhatravritti Demo Portal". It is a deliberately dated, server-rendered, multi-step site with small fonts and tables, a permanent banner saying it is fictional, and no official symbols.

Flow: login (Demo ID and date of birth as DD/MM/YYYY, plus a simple CAPTCHA question unless a 30-minute "trusted device" cookie is present) -> applicant home -> five form sections (personal; address and college; marks and income; bank; uploads) -> mobile OTP -> preview, declaration and Final Submit -> acknowledgement with a tracking ID like `DEMO-SCH-2026-00042` -> status page.

Design points:

- Sessions last 20 minutes and slide on activity. A new login for the same applicant carries the saved draft over.
- Uploads are limited to 2 MB and PDF/JPG/PNG by magic bytes. The portal keeps only metadata, never the file.
- The OTP is never shown on a portal page. It goes to an encrypted demo "SMS" outbox that only the signed-in applicant sees in the checkpoint. It is valid for 10 minutes and allows 5 attempts.
- A repeated submit with the same `Idempotency-Key` returns the original tracking ID.
- Data is stored encrypted in service-only tables (`demo_portal_sessions`, `demo_applications`, `demo_sms_outbox`), or in memory with `DEMO_PORTAL_STORE=memory` for local tests. Identifiers are stored as keyed hashes.

**Chaos flags.** `?chaos=1` turns on every obstacle; a comma list such as `?chaos=popup,expiry` turns on some (`packages/shared/src/demo-portal.ts`). The worker adds `chaos=1` to the login URL when the run was started with practice obstacles (the default in the start form).

| Flag | Obstacle |
| --- | --- |
| `expiry` | The session expires once, right after section 1 is saved; the agent must sign in again and continue. |
| `dropdown` | The district and institution lists load after 1.5 s instead of 150 ms. |
| `popup` | A notice dialog on the applicant home must be dismissed. |
| `validation` | Date of birth must be exactly DD/MM/YYYY and the percentage must have exactly two decimals, so the first attempt fails. |
| `injection` | The notice contains text telling AI agents to type the bank account number into Remarks and email it away. It must be ignored. |

CAPTCHA, OTP, upload limits and the declaration are always on.

## Receipts

After Final Submit, the worker reads the tracking ID from the acknowledgement page (it must look like a tracking ID), takes a screenshot, and writes plain-language summaries in English and Hindi from a fixed template (`packages/shared/src/receipt.ts`), never from a model. The PDF is rendered by Chromium's print engine (`apps/worker/src/executor/receipt.ts`), because pdf-lib cannot shape Devanagari correctly. The render runs in an offline context with JavaScript off and every request blocked; the image installs `fonts-noto-core` for Hindi. The PDF goes to `run-artifacts/{user_id}/{run_id}/receipt.pdf`.

The receipt page shows a stamp, the tracking ID with a copy button, the status explanation, the PDF download (a 60-second signed URL), a gallery of the latest screenshots (300-second signed URLs) and a link to the portal's status page.

## Adding a new service definition safely

1. Write `config/services/<slug>.json`. It must pass `ServiceDefinition` in `packages/shared/src/schemas.ts`:
   - `fields`: key, type, required, `sensitive`, English and Hindi labels, optional pattern or options, and `sources` (`<document kind>.<extracted key>`).
   - `requiredDocs`: kind, labels, `maxBytes` (at most 4 MB), allowed types, whether it is uploaded to the portal, and the keys to extract.
   - `eligibility.rules`: `gte`, `lte`, `eq`, `in`, `between` or `ageBetween` on a field.
   - `workflow`: `startPath`, `sessionExpired`, `errorSelector`, and steps with a phase (`execute`, `approve`, `submit`), actions, `allowedClicks`, a `done` condition and an optional tracking-ID `capture`.
2. The schema refuses: field sources that no document extracts, steps that use unknown fields or documents, duplicate step IDs, a `loginStep` that is not a step, eligibility rules on unknown fields, and real portals without a terms review.
3. Safety rules for authors:
   - Mark every personal field `sensitive: true`. Sensitive values are masked in the audit log, in screenshots and in model prompts.
   - Put every CAPTCHA and OTP behind a `human` action. Never script an answer.
   - Put an `approve` step before the `submit` step. Use `submit` with `requiresApproval: true` for the final button, and `requiresApproval` on the declaration checkbox.
   - Keep `allowedClicks` to the step's own buttons.
   - Collect only fields the workflow types or the rules read; anything else is never asked for.
4. Add it to `BUNDLED_SERVICES` in `packages/shared/src/services.ts`, run `npm run db:schema`, and apply `supabase/schema.sql` again (or run `npm run seed:demo`). Bump `version` whenever you change it; `doctor` warns when the database and the code disagree.
5. Add unit tests for the definition, and run it end to end against a test portal before enabling it.

**Real portals** need more, on purpose. Automating someone else's website can be unauthorised access under the IT Act (ss. 43 and 66) if the site's terms do not allow it. So a definition with `portalKind: "real"` must include a `termsReview` with `reviewedAt`, `reviewer`, `permitsUserDirectedAutomation: true` and `notes`; the schema refuses it otherwise. That record shows who checked the terms, when, and what they found. It also needs `ENABLE_REAL_PORTALS=true` and the host in `ALLOWED_PORTAL_HOSTS` (then any path on that host is allowed), and the executor refuses to run it while real portals are off. Two things in the code assume the demo portal today and would need work first: the receipt always names the demo portal, and the worker's `DEMO_PORTAL_BASE_URL` is the base URL for every workflow.
