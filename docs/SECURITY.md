# Security

This page explains where data goes, who can read it, and which code enforces each security rule. File paths are relative to the repository root.

## Reporting a vulnerability

Please email the address configured as `SUPPORT_EMAIL` (it is shown on the Grievance page). Tell us what you found, how to reproduce it, and what you think the impact is. Please do not access other people's data, run automated scans against the live site, or share the issue publicly before we have fixed it. We will reply to confirm we received it and keep you updated. There is no separate security address yet.

## Data-flow map

```
  Applicant's browser
     |  HTTPS pages and forms (CSP with per-request nonce, SameSite=Lax cookies)
     |  WSS  Supabase Realtime (anon key + the user's session; RLS applies)
     v
  Web app  (Vercel, apps/web) ---------- service-role key, server only ---------+
     |  hosts /demo-portal (fictional)                                          |
     |                                                                          v
     |  POST /wake  (HMAC, 5-minute window)                  Supabase (one project)
     v                                                         - Auth (accounts, sessions)
  Worker  (Docker, apps/worker) -------- service-role key ----> - Postgres (RLS on every table)
     |   claims runs, writes steps,                              - Storage (two private buckets)
     |   uploads screenshots and receipts                        - Realtime (runs, run_steps, approvals)
     |
     |  Playwright browser, egress allowlist:
     |  demo portal host, /demo-portal paths only
     v
  Demo portal (/demo-portal on the web app)

  Worker --HTTPS--> AI provider (Anthropic)
     only with "AI processing" consent and LLM_DISABLED=false;
     document text with Aadhaar masked, or the image/PDF itself;
     page snapshots with sensitive values masked and typed values described by shape only
```

### What is stored where

| Data | Where | Encrypted by the app? | Who can read it | Kept until |
| --- | --- | --- | --- | --- |
| Email, password hash, sessions | Supabase Auth (`auth.users`) | Managed by Supabase (passwords hashed) | The user; service role | Account deletion |
| Language, theme, onboarding time | `accounts` | No (not sensitive) | Owner (RLS) | Account deletion |
| Confirmed profile (name, date of birth, bank details, ...) | `profiles_private.data_enc` | Yes, AES-256-GCM, bound to the user ID | Ciphertext: owner (RLS). Plain text: only server code (web server, worker) that holds `ENCRYPTION_KEY` | "Keep my profile" withdrawn (row deleted) or account deletion |
| Consent grants and withdrawals | `consents` | No (purpose, yes/no, notice version, time) | Owner reads; owner appends; nobody updates | Account deletion |
| Uploaded documents | Storage `user-documents/{user_id}/{uuid}.{ext}` | Storage encryption at rest is the provider's; no app-level encryption | Owner (storage policy) and the worker. Never served back to the browser | `RETENTION_HOURS` (default 24), a newer upload of the same kind, Aadhaar detection, the delete button, or account deletion |
| Document metadata and extracted values | `documents` (`kind`, `sha256`, `mime`, `size_bytes`; `extracted_enc`) | Extracted values: yes, AES-256-GCM bound to user and document | Owner (RLS); plain text only server-side | Same as the file |
| Document content sent for reading | AI provider | TLS in transit | The provider, under its terms | Not stored by us |
| Run status and audit log | `runs`, `run_steps` | No; values are masked before insert | Owner (RLS and Realtime) | Account deletion (screenshot links are cleared after `RETENTION_HOURS`) |
| Step screenshots | Storage `run-artifacts/{user_id}/{run_id}/step-NNNN.jpg` | Sensitive inputs are painted over in the image | Owner, through signed URLs (120 s live view, 300 s gallery) | `RETENTION_HOURS` |
| Receipt PDF | Storage `run-artifacts/{user_id}/{run_id}/receipt.pdf` | No; it holds the tracking ID, summaries and a screenshot of the acknowledgement page | Owner, through a 60 s signed URL | Account deletion (the retention job does not delete receipts) |
| Receipt row | `receipts` | No (tracking ID, summaries) | Owner (RLS) | Account deletion |
| Checkpoints | `approvals.payload_redacted` | No; sensitive values masked | Owner (RLS) | Account deletion |
| OTP / CAPTCHA answers | `approval_responses.response_enc` | Yes, AES-256-GCM bound to run and approval | Service role only | Deleted by the worker as soon as it types them |
| Rate-limit counters | `rate_limits` | No. Keys hold a hashed IP, a user ID, or the email address typed into an auth form | Service role only | Rows older than 2 days are deleted on every hit |
| Model token and cost totals | `runs.llm_usage` | No | Owner (RLS) | Account deletion |
| Demo portal sessions | `demo_portal_sessions.state_enc` | Yes; Demo ID stored only as a keyed hash | Service role only | Session expiry (retention job removes them) |
| Demo portal applications | `demo_applications` | Form data encrypted; Demo ID and DOB as keyed hashes; uploads as metadata only | Service role only | Form data cleared after `RETENTION_HOURS`; the row (tracking ID, status, hashes) until account deletion |
| Demo "SMS" (OTP) | `demo_sms_outbox.message_enc` | Yes; mobile as keyed hash | Service role; shown to the signed-in owner during an OTP checkpoint | 10 minutes (retention job removes expired rows) |
| Worker logs | The worker host's log store | No; every line is redacted | Host operators | The host's log retention |
| Cookies | Browser | Supabase session cookies; `NEXT_LOCALE`, `theme`; the portal's `rcdp_sid`, `rcdp_trusted` (httpOnly, path `/demo-portal`) | The browser | Session or a year (preferences) |

## Checklist and where it lives

| Item | How it is done | Code |
| --- | --- | --- |
| Strict CSP with a per-request nonce | Every page request gets a fresh nonce. `script-src 'self' 'nonce-…' 'strict-dynamic'`; `connect-src` and `img-src` allow only our origin and the Supabase project (HTTPS and WSS); `font-src 'self'`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'none'`; `upgrade-insecure-requests` in production. The root layout reads headers so every page renders per request. | `apps/web/proxy.ts`, `apps/web/app/layout.tsx` |
| Security headers | HSTS (2 years, subdomains, preload), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`, a restrictive `Permissions-Policy`; `X-Powered-By` off. Worker responses send `nosniff` and `no-store`. | `apps/web/next.config.ts`, `apps/worker/src/server.ts` |
| CSRF-safe mutations | Server Actions accept only POST and Next.js checks their `Origin` against the host. State-changing route handlers call `isSameOrigin` (Origin must be the site, or `Sec-Fetch-Site: same-origin`): document upload and delete, sign-out. Session and preference cookies are `SameSite=Lax`. GET routes only read. | `apps/web/lib/request.ts`, `apps/web/app/api/documents/route.ts`, `apps/web/app/(site)/auth/signout/route.ts`, `apps/web/app/actions/*` |
| Input validation | Zod schemas for the environment (web, worker, `doctor`), auth forms, consent purpose, the profile, service definitions, stored extractions, and every model output. Other inputs use explicit allowlists and patterns: profile fields through `normalizeValue` / `checkValue` with each field's pattern, run IDs by UUID shape, decisions and controls by fixed values, OTP/CAPTCHA answers up to 32 characters, upload kinds against the service definition. | `packages/shared/src/env.ts`, `packages/shared/src/schemas.ts`, `packages/shared/src/values.ts`, `apps/web/app/actions/*.ts`, `apps/web/lib/data.ts`, `apps/web/lib/runs.ts` |
| Upload checks | Same-origin, signed-in, "Keep my profile" consent, 30 uploads per hour per user. Size must be at most the document's `maxBytes` (2 MB in the scholarship definition). The real type is read from magic bytes, not the browser's MIME type, and must be in the document's allowed list (PDF, JPEG, PNG). PDFs with a text layer are scanned for Aadhaar numbers (12 digits, Verhoeff checksum) and refused. Files go to `{user_id}/{uuid}.{ext}` with a SHA-256 recorded. The buckets also enforce size and type limits, and the table has check constraints. | `apps/web/app/api/documents/route.ts`, `packages/shared/src/files.ts`, `packages/shared/src/redaction.ts`, `supabase/migrations/20261101000400_storage_realtime.sql`, `supabase/migrations/20261101000100_tables.sql` |
| No raw PII in logs | The worker's JSON logger redacts every message and field (Aadhaar, emails, Demo IDs, PAN-like codes, long digit runs; sensitive keys masked to the last 4 characters). The audit log stores field labels and masked values only (`XXXXXX3210`). Page snapshots mask sensitive inputs before they leave the browser. Screenshots paint over sensitive inputs and password fields. The agent e2e asserts no raw sensitive value reaches the audit log. | `packages/shared/src/redaction.ts`, `apps/worker/src/logger.ts`, `apps/worker/src/executor/executor.ts`, `apps/worker/src/executor/snapshot.ts`, `e2e/agent.spec.ts` |
| Per-user and per-IP rate limits | Postgres fixed-window counter `hit_rate_limit` (service role only). Sign-in, sign-up, password reset and demo login: 20 per hour per hashed IP and 8 per hour per email address. Uploads: 30 per hour per user. New applications: `MAX_RUNS_PER_USER_PER_DAY` in the last 24 hours. The demo portal allows 5 OTP attempts. Supabase Auth applies its own limits too. | `supabase/migrations/20261101000300_functions.sql`, `apps/web/lib/request.ts`, `apps/web/app/actions/auth.ts`, `apps/web/lib/runs.ts` |
| Storage only through signed URLs | Both buckets are private and every path starts with `{user_id}/`, enforced by storage policies. The app hands out short signed URLs: latest screenshot 120 s, receipt gallery 300 s, receipt PDF 60 s. Uploaded documents are never served back. `doctor` fails if a bucket is public. | `supabase/migrations/20261101000400_storage_realtime.sql`, `apps/web/lib/run-state.ts`, `apps/web/app/(site)/app/runs/[id]/receipt/page.tsx`, `apps/web/app/api/runs/[id]/receipt-pdf/route.ts`, `scripts/doctor.ts` |
| Service-role key server-side only | Read only through `env()` on the server; the variable has no `NEXT_PUBLIC_` prefix, so Next.js never puts it in browser code. The browser client uses the anon key and only subscribes to Realtime. Every service-role query is filtered by the signed-in user's ID after `auth.getUser()`. | `apps/web/lib/supabase/server.ts`, `apps/web/lib/supabase/browser.ts`, `apps/web/lib/env.ts`, `apps/web/lib/runs.ts`, `apps/worker/src/store/supabase.ts` |
| Row-level security on every table | Owners can read their own rows; users can write only accounts, profile, consents (insert) and documents. Runs, steps, approvals and receipts are written by the server after ownership checks. Service-only tables have RLS with no policies and revoked grants. `doctor` checks anonymous access; `app.spec.ts` checks user A cannot read user B's rows or files. | `supabase/migrations/20261101000200_rls.sql`, `scripts/doctor.ts`, `e2e/app.spec.ts` |
| Application-level encryption | AES-256-GCM, random 96-bit IV per value, additional authenticated data binds each ciphertext to its row. Token format `enc:v<version>:...` allows key rotation with `ENCRYPTION_KEY_VERSION` and `ENCRYPTION_PREVIOUS_KEYS`. Keyed hashes (HKDF-derived HMAC) for demo-portal lookups. | `packages/shared/src/crypto.ts`, `packages/shared/test/crypto.test.ts` |
| Dependency audit and secret scanning in CI | Job `checks` runs `npm audit --omit=dev --audit-level=high` (production dependencies) and gitleaks on every push; the workflow also runs nightly and on demand. | `.github/workflows/ci.yml` |
| Worker runs as non-root, minimal inbound | The image switches to `pwuser`. The server answers only `GET /health` and `POST /wake` (body up to 4 KB); everything else is 404. Work comes from the database, not from requests. | `Dockerfile.worker`, `apps/worker/src/server.ts` |
| HMAC on worker endpoints | `/wake` needs `x-worker-signature: t=<unix seconds>,v1=<HMAC-SHA256 of "t.body">` with `WORKER_SHARED_SECRET`; timestamps more than 300 seconds (5 minutes) off are refused; comparison is constant-time. `/wake` carries no data: at worst a replay inside the window makes the worker poll once early. `/health` is public and returns only the worker ID, a busy flag and the model client name. | `packages/shared/src/hmac.ts`, `apps/web/lib/worker.ts`, `apps/worker/src/server.ts` |
| Agent egress allowlist | Built from `DEMO_PORTAL_BASE_URL`: on that host only `/demo-portal`, `/_next/static/` and `/favicon.ico` (so the agent cannot reach `/api/*` or user pages on the same host). Other `ALLOWED_PORTAL_HOSTS` count only when `ENABLE_REAL_PORTALS=true`. HTTPS only, except plain HTTP on localhost names; URLs with credentials are refused. Enforced for every browser request with `context.route` (blocked requests are aborted and logged), again before each `goto`, and again in the validator for model-proposed navigation and links. Each run gets a fresh browser context with no stored cookies, service workers blocked and downloads off. The receipt renderer blocks all requests. | `packages/shared/src/egress.ts`, `apps/worker/src/executor/egress.ts`, `apps/worker/src/executor/executor.ts`, `apps/worker/src/executor/receipt.ts`, `e2e/agent.spec.ts` |
| Validator for model actions | Rejects: elements not on the page or disabled; fill/select outside the current step's field map; fields without a confirmed value; any value that is not the confirmed value or a named format variant of it; select options not in the list; clicks other than the step's declared controls, its `allowedClicks`, or notice-dismiss buttons; any final-submit control before the submit phase and a recorded approval; links and `goto` off the allowlist; keys other than Enter, Tab, Escape; waits over 5 seconds. | `packages/shared/src/validator.ts`, `packages/shared/src/values.ts`, `packages/shared/test/validator.test.ts` |
| Prompt-injection handling | Page content goes to the model inside `<untrusted_page_content>` and cannot close that block. The system prompts are constant and say page and document text is data, never instructions. The model flags `suspicious_page_instructions`; a pattern scan also checks page text. Either logs a warning and one "ignored instructions" audit step per run. The real defence is the validator: page text cannot add fields, values, clicks or destinations. Sensitive values are never shown to the model; it picks a format by name and sees only its shape (`99/99/9999`). The demo portal's `injection` chaos flag tests this end to end. | `packages/shared/src/injection.ts`, `apps/worker/src/llm/prompts.ts`, `apps/worker/src/executor/executor.ts`, `apps/web/lib/demo-portal/forms.ts`, `e2e/agent.spec.ts` |
| Idempotent submit | Each run has a unique random `idempotency_key`. Before submitting, the worker checks for an existing receipt; the submit request carries an `Idempotency-Key` header; the demo portal returns the original tracking ID for a repeated key (unique index on `demo_applications.idempotency_key`); `receipts.run_id` is unique. | `apps/worker/src/executor/executor.ts`, `apps/web/app/demo-portal/actions/submit/route.ts`, `supabase/migrations/20261101000100_tables.sql`, `e2e/agent.spec.ts` |
| Database status guard | A `BEFORE UPDATE` trigger refuses status changes not in the state machine, refuses `SUBMITTING` without an approved `final_submit` approval, refuses `PLANNING` without `authorized_at`, and stamps `finished_at` on terminal states. One open approval per run (partial unique index). Consents are append-only (trigger). | `supabase/migrations/20261101000300_functions.sql`, `supabase/migrations/20261101000100_tables.sql` |
| Authentication | Supabase Auth with cookie sessions; email confirmation; `auth.getUser()` (checked with the Auth server, not just the cookie) before any data access; `/app/*` redirects to `/signin?next=`; `safeNext` allows only same-site relative redirects. | `apps/web/proxy.ts`, `apps/web/lib/auth.ts`, `apps/web/app/(site)/auth/callback/route.ts` |
| Secrets only from the environment | All secrets come from env and are validated at start-up; `.env.local` is git-ignored; `npm run keygen` makes strong random values. | `packages/shared/src/env.ts`, `.gitignore`, `scripts/keygen.ts` |

## Known gaps

We prefer to list these plainly:

- `style-src` allows `'unsafe-inline'` because React and the animation library set inline styles. Scripts stay nonce-only.
- `rate_limits` keys for auth forms contain the email address as typed, in clear, for up to 2 days (service role only). The IP is hashed with SHA-256 but not salted.
- The rate limiter fails open if the database call errors. Authentication checks never fail open.
- Image uploads cannot be scanned for Aadhaar numbers before the model reads them. See `docs/PRIVACY_COMPLIANCE.md`.
- Receipt PDFs are kept until account deletion, not deleted after `RETENTION_HOURS`.
- The fictional demo portal's own form routes do not check `Origin`. They hold only practice data.
- `SENTRY_DSN` is validated but no error tracker is wired in, so errors are visible only in host logs.
- Storage objects are encrypted at rest by the provider, not by the app.
