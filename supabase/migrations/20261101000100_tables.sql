-- Core tables. Personal data lives only in *_enc columns, encrypted by the
-- application (AES-256-GCM) before it reaches the database.

create extension if not exists pgcrypto;

do $$ begin
  create type public.run_status as enum (
    'QUEUED', 'EXTRACTING', 'NEEDS_PROFILE_CONFIRM', 'PLANNING', 'EXECUTING',
    'AWAITING_HUMAN', 'AWAITING_FINAL_APPROVAL', 'SUBMITTING', 'COMPLETED',
    'FAILED', 'CANCELLED', 'PAUSED_EXPIRED'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.approval_kind as enum ('otp', 'captcha', 'final_submit');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.approval_decision as enum ('approved', 'rejected', 'provided', 'expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.consent_purpose as enum ('store_profile', 'ai_processing', 'agent_actions');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.run_control as enum ('none', 'pause', 'cancel');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.step_result as enum ('ok', 'error', 'retry', 'blocked', 'info', 'waiting');
exception when duplicate_object then null; end $$;

-- Non-sensitive account settings and onboarding state.
create table if not exists public.accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  locale text not null default 'en' check (locale in ('en', 'hi')),
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Encrypted JSON profile: { field_key: { value, source, confirmed, confirmedAt } }
create table if not exists public.profiles_private (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data_enc text not null,
  schema_version integer not null default 1,
  confirmed_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Append-only consent ledger. Never updated; deleted only with the account.
create table if not exists public.consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  purpose public.consent_purpose not null,
  granted boolean not null,
  notice_version text not null,
  created_at timestamptz not null default now()
);
create index if not exists consents_user_purpose_idx on public.consents (user_id, purpose, created_at desc);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind ~ '^[a-z][a-z0-9_]*$'),
  storage_key text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes integer not null check (size_bytes > 0),
  extracted_enc text,
  extraction_status text not null default 'pending'
    check (extraction_status in ('pending', 'done', 'skipped', 'failed', 'rejected')),
  confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists documents_user_kind_idx on public.documents (user_id, kind, created_at desc);
create index if not exists documents_expires_idx on public.documents (expires_at);

-- Service definitions. `definition` is the source of truth; the other columns are derived from it.
create table if not exists public.services (
  slug text primary key,
  definition jsonb not null,
  name jsonb generated always as (definition -> 'name') stored,
  version integer generated always as ((definition ->> 'version')::integer) stored,
  workflow jsonb generated always as (definition -> 'workflow') stored,
  eligibility jsonb generated always as (definition -> 'eligibility') stored,
  required_docs jsonb generated always as (definition -> 'requiredDocs') stored,
  portal_kind text generated always as (definition ->> 'portalKind') stored,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  service_slug text not null references public.services (slug),
  service_version integer not null,
  status public.run_status not null default 'QUEUED',
  current_step text,
  error text,
  idempotency_key text not null unique default encode(gen_random_bytes(16), 'hex'),
  control public.run_control not null default 'none',
  chaos boolean not null default false,
  manual_entry boolean not null default false,
  authorized_at timestamptz,
  worker_id text,
  lease_until timestamptz,
  attempt integer not null default 0,
  llm_usage jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists runs_user_created_idx on public.runs (user_id, created_at desc);
create index if not exists runs_claimable_idx on public.runs (created_at) where status in ('QUEUED', 'PLANNING');

-- The audit log. Values are redacted by the worker before insert.
create table if not exists public.run_steps (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.runs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  seq integer not null,
  step_id text,
  action text not null,
  target_label text,
  value_redacted text,
  result public.step_result not null,
  message text,
  screenshot_key text,
  created_at timestamptz not null default now(),
  unique (run_id, seq)
);
create index if not exists run_steps_run_idx on public.run_steps (run_id, seq);
create index if not exists run_steps_created_idx on public.run_steps (created_at) where screenshot_key is not null;

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.approval_kind not null,
  payload_redacted jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  resolved_at timestamptz,
  decision public.approval_decision
);
create unique index if not exists approvals_one_open_per_run on public.approvals (run_id) where resolved_at is null;
create index if not exists approvals_run_idx on public.approvals (run_id, requested_at desc);

-- What the human typed for an OTP / CAPTCHA, encrypted. Service role only; deleted as soon as the worker uses it.
create table if not exists public.approval_responses (
  approval_id uuid primary key references public.approvals (id) on delete cascade,
  response_enc text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.runs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  tracking_id text not null,
  receipt_pdf_key text,
  summary_en text not null,
  summary_hi text not null,
  created_at timestamptz not null default now()
);

-- Fixed-window counters for per-user and per-IP limits.
create table if not exists public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);

/* ---------------- Fictional demo portal (service-role access only) ---------------- */

create sequence if not exists public.demo_tracking_seq start with 42;

create table if not exists public.demo_portal_sessions (
  id text primary key,
  demo_id_hash text not null,
  state_enc text not null,
  chaos text[] not null default '{}',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.demo_applications (
  id uuid primary key default gen_random_uuid(),
  tracking_id text not null unique,
  idempotency_key text unique,
  demo_id_hash text not null,
  dob_hash text not null,
  status text not null default 'Submitted - under verification',
  data_enc text,
  uploads jsonb not null default '[]'::jsonb,
  submitted_at timestamptz not null default now(),
  data_expires_at timestamptz not null
);

-- "SMS" the demo portal pretends to send. Shown to the signed-in applicant, never to the agent.
create table if not exists public.demo_sms_outbox (
  id bigint generated always as identity primary key,
  mobile_hash text not null,
  message_enc text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists demo_sms_mobile_idx on public.demo_sms_outbox (mobile_hash, created_at desc);
