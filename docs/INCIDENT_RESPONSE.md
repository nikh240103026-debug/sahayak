# Incident response plan

> **Template - review with a lawyer before launch.** Fill every `[PLACEHOLDER]`, confirm the legal deadlines against the current law, and rehearse this plan once before real users arrive.

This plan covers security incidents and personal data breaches: anything that may expose, change, lose or misuse personal data, or that compromises our systems. When in doubt, treat it as an incident and start here.

## 1. Detection

Where incidents usually show up:

- **Worker logs** (JSON lines on the worker host). Look for `"level":"error"`, `run crashed`, `worker tick failed`, repeated `suspicious page instructions ignored`, and unexpected `blocked_request` entries.
- **Audit log** (`run_steps`). Unusual `blocked`, `ignored_instructions` or `stopped` rows; steps on runs the user says they did not start.
- **Vercel logs and Cron Jobs.** Failing `/api/cron/retention` runs (401 means `CRON_SECRET` is wrong; a failure means expired data may not be deleting), errors in route handlers.
- **Supabase dashboard.** Auth logs (spikes in sign-ups or failed sign-ins), API logs, unexpected service-role activity, storage growth, changes to RLS policies or buckets.
- **`npm run doctor`.** It fails if a bucket became public or anonymous users can read protected tables.
- **CI.** gitleaks findings (a secret in the repository) and `npm audit` alerts.
- **People.** Reports to `SUPPORT_EMAIL` or `GRIEVANCE_EMAIL`, and messages from providers (Supabase, Vercel, the worker host, the AI provider).

Whoever notices first: write down the time, what you saw and where, then tell the incident lead (see the contact sheet).

## 2. Triage and severity

The incident lead decides severity within the first hour and records it in the incident log.

| Severity | Examples | Response |
| --- | --- | --- |
| **SEV-1, critical** | A secret is exposed (`SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_KEY`); personal data read by someone who should not; RLS or a bucket left open; the agent acted on a portal without the user's approval | Start containment now, at any hour. Start the legal clock (section 6). |
| **SEV-2, high** | `WORKER_SHARED_SECRET` or `CRON_SECRET` exposed; the AI provider reports an incident; prompt-injection attempts that got past the scan but were stopped by the validator; retention not running for more than a day | Contain the same day. Assess whether personal data was affected. |
| **SEV-3, moderate** | A vulnerable dependency with no known exploit; repeated failed sign-ins from one source | Fix in the normal cycle; watch for escalation. |

Questions to answer early:

- What data is involved? Use the data-flow table in `docs/SECURITY.md`.
- Whose data, and how many people?
- Is it still happening?
- Was the data encrypted by the app (`*_enc` columns) and was the key also exposed?

## 3. Containment

Do the steps that match the incident. Note the time of each one.

### Stop the agent

- **Model kill switch.** Set `LLM_DISABLED=true` on the worker and in Vercel, then restart the worker and redeploy the web app. The worker makes no model calls; new runs start in manual-entry mode.
- **Real portals stay off.** Confirm `ENABLE_REAL_PORTALS=false` on the worker and that `ALLOWED_PORTAL_HOSTS` is empty. Never turn it on during an incident.
- **Scale the worker to zero.** Suspend the service on its host (Render: suspend; Hugging Face: pause the Space; laptop: `docker compose down`). Runs wait in the queue and nothing is submitted. A run the worker was holding keeps its status until a worker runs again; that worker then marks it `PAUSED_EXPIRED` (its lease has lapsed).
- **Stop new applications.** Set `MAX_RUNS_PER_USER_PER_DAY` very low and redeploy, if you need the site up but quiet.

### Rotate secrets

Rotate any secret that may be exposed, and anything that could have been read with it.

**`ENCRYPTION_KEY`** (protects profiles, extracted document fields, OTP/CAPTCHA answers and demo-portal data):

1. `npm run keygen` and take the new `ENCRYPTION_KEY`.
2. Move the current key into the previous list with its version, for example `ENCRYPTION_PREVIOUS_KEYS=1:<old base64 key>`. Several entries are comma-separated.
3. Set the new key as `ENCRYPTION_KEY` and raise `ENCRYPTION_KEY_VERSION` (for example to `2`).
4. Update Vercel and the worker together, then redeploy and restart.

New values are written with the new key; old values still decrypt with the previous key (ciphertexts start with `enc:v<version>:`). Rows are re-encrypted when they are next saved. If the old key was leaked, treat existing ciphertexts as exposed: tell affected users, and remove the old key from `ENCRYPTION_PREVIOUS_KEYS` only once you accept that data still under it becomes unreadable. Demo-portal lookups use keyed hashes derived from the current key, so after rotation in-progress practice-portal OTPs, CAPTCHAs and carried-over drafts stop matching; ask those users to restart.

**`SUPABASE_SERVICE_ROLE_KEY`**: rotate (or roll the project's JWT secret / secret API keys) in Supabase, then update Vercel and the worker and restart both. Rolling the JWT secret also signs everyone out. Check Supabase logs for what the old key was used for.

**`WORKER_SHARED_SECRET`**: `npm run keygen`, update Vercel and the worker together. Until both match, `/wake` returns 401 and runs start on the worker's next poll.

**`CRON_SECRET`**: `npm run keygen`, update it in Vercel and redeploy. Vercel sends the new value to the retention cron automatically.

**`ANTHROPIC_API_KEY`**: revoke it in the provider console, create a new one, update the worker.

**Others**: SMTP password (Supabase Auth settings), Google OAuth client secret, `DEMO_LOGIN_PASSWORD` (and set `NEXT_PUBLIC_ENABLE_DEMO_LOGIN=false`), GitHub and hosting account passwords and tokens.

### Close the hole

- If RLS or a bucket was open: re-run `supabase/schema.sql` (it is safe to run again) and run `npm run doctor`.
- If an account was taken over: sign the user out from Supabase Auth and help them reset the password.
- If a dependency is the cause: pin or patch it, rebuild, redeploy.

## 4. Evidence preservation

Before you clean up, keep a copy of what you will need later. Keep it in a restricted place and do not copy more personal data than you need.

- Export the relevant worker logs and Vercel logs (they expire on the hosts).
- Export Supabase Auth and API logs for the incident window.
- Save the relevant `run_steps`, `approvals`, `runs` and `consents` rows (they are already redacted or append-only).
- Note the deployed commit (`git rev-parse HEAD`) and environment settings, without secret values.
- Keep an incident log: times, actions, who did what, and why.

Do not delete the affected users' data as a containment step unless they ask, or unless keeping it causes more harm. Deleting it can destroy evidence.

## 5. Eradication and recovery

1. Fix the root cause in code or configuration, with a test where possible.
2. Rebuild and redeploy the web app and the worker from a clean commit.
3. Run `npm run doctor` and `npm run smoke`.
4. Turn the model back on (`LLM_DISABLED=false`) and scale the worker up only when you are confident.
5. Watch logs closely for a few days.

## 6. Notification

### Affected users (DPDP Rules 2025)

The DPDP Rules require us to tell each affected person about a personal data breach without delay, in plain language, through their account or email. Include:

- what happened and when, in short;
- what data was involved, and its likely consequences for them;
- what we have done and are doing;
- what they can do to protect themselves (for example: change passwords, watch for fake OTP messages, do not share OTPs);
- how to contact us: `GRIEVANCE_EMAIL`, and the grievance officer `[GRIEVANCE_OFFICER_NAME]`.

Write it in English and Hindi, like the rest of the product.

### Data Protection Board of India (DPDP Rules 2025)

As we read Rule 7 (verify against the Gazette text and current guidance before relying on it):

1. An initial intimation to the Board without delay after we become aware of the breach.
2. A detailed report within 72 hours of becoming aware, unless the Board allows longer on a written request: facts and timeline, causes, likely impact, measures taken to mitigate, findings about who caused it if known, remedial measures, and the notices sent to affected people.

Use the Board's official channel: `[DPB_REPORTING_CHANNEL]`.

### CERT-In

Cyber security incidents must be reported to CERT-In within its mandated window. That window is short: it is commonly cited as **6 hours** from noticing the incident, under CERT-In's directions of April 2022 under section 70B of the IT Act. Re-verify the current window, the list of reportable incident types and the reporting format before launch. Report to `[CERT_IN_REPORTING_CHANNEL]`, and keep the confirmation.

The same directions also contain rules on log retention and points of contact. Check what applies to us with the lawyer.

### Others

- Our providers, if the incident involves them (Supabase, Vercel, the worker host, the AI provider).
- Other authorities or contracts as the lawyer advises.

## 7. Post-incident review

Within two weeks of closing the incident:

- Write a short, blameless review: timeline, root cause, what worked, what did not.
- List actions with owners and dates. Typical ones: a new test, a new `doctor` check, a tighter allowlist or validator rule, a new redaction pattern, a documentation fix.
- Update this plan and `docs/SECURITY.md` if anything here was wrong or missing.
- Record the incident and the notifications made, with dates.

## 8. Contact sheet

| Role | Name | Phone | Email |
| --- | --- | --- | --- |
| Incident lead | `[INCIDENT_LEAD_NAME]` | `[INCIDENT_LEAD_PHONE]` | `[INCIDENT_LEAD_EMAIL]` |
| Backup lead | `[BACKUP_LEAD_NAME]` | `[BACKUP_LEAD_PHONE]` | `[BACKUP_LEAD_EMAIL]` |
| Grievance officer | `[GRIEVANCE_OFFICER_NAME]` | `[GRIEVANCE_OFFICER_PHONE]` | `[GRIEVANCE_EMAIL]` |
| Legal counsel | `[LEGAL_COUNSEL_NAME]` | `[LEGAL_COUNSEL_PHONE]` | `[LEGAL_COUNSEL_EMAIL]` |
| Legal entity | `[LEGAL_ENTITY_NAME]`, `[LEGAL_ENTITY_ADDRESS]` | | |
| Support inbox | | | `[SUPPORT_EMAIL]` |
| Data Protection Board of India | | | `[DPB_REPORTING_CHANNEL]` |
| CERT-In | | `[CERT_IN_PHONE]` | `[CERT_IN_REPORTING_CHANNEL]` |
| Supabase support | | | `[SUPABASE_SUPPORT_CONTACT]` |
| Vercel support | | | `[VERCEL_SUPPORT_CONTACT]` |
| Worker host support | | | `[WORKER_HOST_SUPPORT_CONTACT]` |
| AI provider support | | | `[AI_PROVIDER_SUPPORT_CONTACT]` |

Keep a printed or offline copy of this sheet. If your accounts are compromised, you may not be able to open the online one.
