-- GENERATED FILE: edit supabase/migrations/*.sql or config/services/*.json, then run `npm run db:schema`.
-- Paste this whole file into the Supabase SQL editor once. It is safe to run again.

-- ==================== 20261101000100_tables.sql ====================
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

-- ==================== 20261101000200_rls.sql ====================
-- Row-level security on every table. A signed-in user can only see their own rows.
-- Writes to runs, run_steps, approvals and receipts happen server-side (service role)
-- after explicit ownership checks; users can read them (and subscribe via Realtime).

alter table public.accounts enable row level security;
alter table public.profiles_private enable row level security;
alter table public.consents enable row level security;
alter table public.documents enable row level security;
alter table public.services enable row level security;
alter table public.runs enable row level security;
alter table public.run_steps enable row level security;
alter table public.approvals enable row level security;
alter table public.receipts enable row level security;
alter table public.rate_limits enable row level security;
alter table public.demo_portal_sessions enable row level security;
alter table public.demo_applications enable row level security;
alter table public.demo_sms_outbox enable row level security;

-- accounts
drop policy if exists accounts_select_own on public.accounts;
create policy accounts_select_own on public.accounts for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists accounts_insert_own on public.accounts;
create policy accounts_insert_own on public.accounts for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists accounts_update_own on public.accounts;
create policy accounts_update_own on public.accounts for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- profiles_private
drop policy if exists profiles_select_own on public.profiles_private;
create policy profiles_select_own on public.profiles_private for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists profiles_insert_own on public.profiles_private;
create policy profiles_insert_own on public.profiles_private for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists profiles_update_own on public.profiles_private;
create policy profiles_update_own on public.profiles_private for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists profiles_delete_own on public.profiles_private;
create policy profiles_delete_own on public.profiles_private for delete to authenticated using ((select auth.uid()) = user_id);

-- consents: read and append only
drop policy if exists consents_select_own on public.consents;
create policy consents_select_own on public.consents for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists consents_insert_own on public.consents;
create policy consents_insert_own on public.consents for insert to authenticated with check ((select auth.uid()) = user_id);

-- documents
drop policy if exists documents_select_own on public.documents;
create policy documents_select_own on public.documents for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists documents_insert_own on public.documents;
create policy documents_insert_own on public.documents for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists documents_update_own on public.documents;
create policy documents_update_own on public.documents for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists documents_delete_own on public.documents;
create policy documents_delete_own on public.documents for delete to authenticated using ((select auth.uid()) = user_id);

-- services: readable catalogue
drop policy if exists services_read on public.services;
create policy services_read on public.services for select to anon, authenticated using (enabled);

-- runs, run_steps, approvals, receipts: read own
drop policy if exists runs_select_own on public.runs;
create policy runs_select_own on public.runs for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists run_steps_select_own on public.run_steps;
create policy run_steps_select_own on public.run_steps for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists approvals_select_own on public.approvals;
create policy approvals_select_own on public.approvals for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists receipts_select_own on public.receipts;
create policy receipts_select_own on public.receipts for select to authenticated using ((select auth.uid()) = user_id);

-- rate_limits, approval_responses, demo_* : RLS on, no policies -> service role only.
alter table public.approval_responses enable row level security;

-- Belt and braces: the browser roles get no direct privileges on service-only tables.
revoke all on public.rate_limits, public.approval_responses, public.demo_portal_sessions,
  public.demo_applications, public.demo_sms_outbox from anon, authenticated;
revoke all on sequence public.demo_tracking_seq from anon, authenticated;

-- ==================== 20261101000300_functions.sql ====================
-- Functions and triggers: run state machine guard, the Postgres job queue,
-- rate limiting, and the append-only consent ledger.

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists accounts_touch on public.accounts;
create trigger accounts_touch before update on public.accounts for each row execute function public.touch_updated_at();
drop trigger if exists profiles_touch on public.profiles_private;
create trigger profiles_touch before update on public.profiles_private for each row execute function public.touch_updated_at();
drop trigger if exists runs_touch on public.runs;
create trigger runs_touch before update on public.runs for each row execute function public.touch_updated_at();

/* ---------------- Run status machine (keep in sync with packages/shared/src/schemas.ts) ---------------- */

create or replace function public.run_status_transition_ok(p_from public.run_status, p_to public.run_status)
returns boolean language sql immutable set search_path = '' as $$
  select case
    when p_from = p_to then true
    when p_from in ('COMPLETED', 'CANCELLED') then false
    when p_to in ('FAILED', 'CANCELLED', 'PAUSED_EXPIRED') then true
    else (p_from::text || '>' || p_to::text) = any (array[
      'QUEUED>EXTRACTING', 'QUEUED>NEEDS_PROFILE_CONFIRM',
      'EXTRACTING>NEEDS_PROFILE_CONFIRM',
      'NEEDS_PROFILE_CONFIRM>PLANNING', 'NEEDS_PROFILE_CONFIRM>QUEUED',
      'PLANNING>EXECUTING', 'PLANNING>NEEDS_PROFILE_CONFIRM',
      'EXECUTING>AWAITING_HUMAN', 'EXECUTING>AWAITING_FINAL_APPROVAL', 'EXECUTING>NEEDS_PROFILE_CONFIRM',
      'AWAITING_HUMAN>EXECUTING',
      'AWAITING_FINAL_APPROVAL>SUBMITTING', 'AWAITING_FINAL_APPROVAL>NEEDS_PROFILE_CONFIRM',
      'SUBMITTING>COMPLETED',
      'FAILED>PLANNING', 'PAUSED_EXPIRED>PLANNING'
    ])
  end
$$;

create or replace function public.runs_status_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    if not public.run_status_transition_ok(old.status, new.status) then
      raise exception 'invalid run status transition % -> %', old.status, new.status using errcode = 'check_violation';
    end if;
    -- Defence in depth: never enter SUBMITTING without a recorded human approval.
    if new.status = 'SUBMITTING' and not exists (
      select 1 from public.approvals a
      where a.run_id = new.id and a.kind = 'final_submit' and a.decision = 'approved'
    ) then
      raise exception 'final approval is required before submitting' using errcode = 'check_violation';
    end if;
    if new.status in ('PLANNING') and new.authorized_at is null then
      raise exception 'the applicant must authorise this run first' using errcode = 'check_violation';
    end if;
    if new.status in ('COMPLETED', 'FAILED', 'CANCELLED', 'PAUSED_EXPIRED') then
      new.finished_at := coalesce(new.finished_at, now());
      new.lease_until := null;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists runs_status_guard on public.runs;
create trigger runs_status_guard before update on public.runs for each row execute function public.runs_status_guard();

/* ---------------- Consents are append-only ---------------- */

create or replace function public.consents_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'consents are append-only' using errcode = 'insufficient_privilege';
  end if;
  -- Deletes are only allowed as part of deleting the whole account (the auth user is already gone).
  if exists (select 1 from auth.users u where u.id = old.user_id) then
    raise exception 'consents are append-only' using errcode = 'insufficient_privilege';
  end if;
  return old;
end $$;

drop trigger if exists consents_append_only on public.consents;
create trigger consents_append_only before update or delete on public.consents
  for each row execute function public.consents_append_only();

/* ---------------- Postgres as the job queue ---------------- */

-- Claim the oldest runnable run. FOR UPDATE SKIP LOCKED lets several workers poll safely.
create or replace function public.claim_next_run(p_worker_id text, p_lease_seconds integer default 120)
returns setof public.runs
language sql security definer set search_path = '' as $$
  with candidate as (
    select r.id from public.runs r
    where (r.status = 'QUEUED' or (r.status = 'PLANNING' and r.authorized_at is not null))
      and (r.lease_until is null or r.lease_until < now())
      and r.control <> 'cancel'
    order by r.created_at
    for update skip locked
    limit 1
  )
  update public.runs r
     set worker_id = p_worker_id,
         lease_until = now() + make_interval(secs => p_lease_seconds),
         attempt = r.attempt + 1,
         started_at = coalesce(r.started_at, now())
    from candidate
   where r.id = candidate.id
  returning r.*
$$;

-- Keep a claimed run's lease alive. Returns false if another worker owns it now.
create or replace function public.extend_run_lease(p_run_id uuid, p_worker_id text, p_lease_seconds integer default 120)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_ok boolean;
begin
  update public.runs
     set lease_until = now() + make_interval(secs => p_lease_seconds)
   where id = p_run_id and worker_id = p_worker_id
  returning true into v_ok;
  return coalesce(v_ok, false);
end $$;

-- Runs whose worker vanished mid-way (crash, host restart) become PAUSED_EXPIRED so the user can restart.
create or replace function public.expire_stale_runs(p_grace_seconds integer default 120)
returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  update public.runs
     set status = 'PAUSED_EXPIRED',
         error = 'The assistant stopped unexpectedly. Nothing was submitted unless your receipt says so. You can restart.'
   where status in ('EXTRACTING', 'EXECUTING', 'AWAITING_HUMAN', 'AWAITING_FINAL_APPROVAL', 'SUBMITTING')
     and lease_until is not null
     and lease_until < now() - make_interval(secs => p_grace_seconds);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

/* ---------------- Rate limiting ---------------- */

-- Returns true while the caller is within p_limit hits per fixed window.
create or replace function public.hit_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count integer;
begin
  insert into public.rate_limits (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = public.rate_limits.count + 1
  returning count into v_count;
  delete from public.rate_limits where window_start < now() - interval '2 days';
  return v_count <= p_limit;
end $$;

/* ---------------- Demo portal helpers ---------------- */

create or replace function public.next_demo_tracking_seq() returns bigint
language sql security definer set search_path = '' as $$
  select nextval('public.demo_tracking_seq')
$$;

/* ---------------- Privileges: these are for the server/worker only ---------------- */

revoke execute on function public.claim_next_run(text, integer) from public, anon, authenticated;
revoke execute on function public.extend_run_lease(uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.expire_stale_runs(integer) from public, anon, authenticated;
revoke execute on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.next_demo_tracking_seq() from public, anon, authenticated;
grant execute on function public.claim_next_run(text, integer) to service_role;
grant execute on function public.extend_run_lease(uuid, text, integer) to service_role;
grant execute on function public.expire_stale_runs(integer) to service_role;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;
grant execute on function public.next_demo_tracking_seq() to service_role;

-- Liveness probe used by the keep-alive cron (touches the database without reading user data).
create or replace function public.health_ping() returns timestamptz
language sql stable set search_path = '' as $$ select now() $$;
grant execute on function public.health_ping() to anon, authenticated, service_role;

-- ==================== 20261101000400_storage_realtime.sql ====================
-- Private storage buckets. Every object path starts with {user_id}/ and the
-- policies below enforce it. The app only hands out short-lived signed URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('user-documents', 'user-documents', false, 4194304, array['application/pdf', 'image/jpeg', 'image/png']),
  ('run-artifacts', 'run-artifacts', false, 10485760, array['image/png', 'image/jpeg', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "user-documents: read own" on storage.objects;
create policy "user-documents: read own" on storage.objects for select to authenticated
  using (bucket_id = 'user-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "user-documents: upload own" on storage.objects;
create policy "user-documents: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'user-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "user-documents: delete own" on storage.objects;
create policy "user-documents: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'user-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Screenshots and receipts are written by the worker (service role); users may read their own.
drop policy if exists "run-artifacts: read own" on storage.objects;
create policy "run-artifacts: read own" on storage.objects for select to authenticated
  using (bucket_id = 'run-artifacts' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Live progress over Supabase Realtime (postgres_changes honours RLS).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.run_steps;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.runs;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.approvals;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- ==================== services seed ====================
insert into public.services (slug, definition, enabled)
values ('scholarship_demo', $svc${"slug":"scholarship_demo","version":1,"enabled":true,"portalKind":"demo","name":{"en":"Post-matric student scholarship (demo)","hi":"पोस्ट-मैट्रिक छात्र छात्रवृत्ति (डेमो)"},"summary":{"en":"A yearly scholarship for college students from lower-income families. This runs on a fictional practice portal, so nothing is sent to any real office.","hi":"कम आय वाले परिवारों के कॉलेज छात्रों के लिए सालाना छात्रवृत्ति। यह एक काल्पनिक अभ्यास पोर्टल पर चलती है, इसलिए कुछ भी किसी असली दफ़्तर को नहीं भेजा जाता।"},"fields":[{"key":"full_name","type":"text","required":true,"sensitive":false,"label":{"en":"Full name","hi":"पूरा नाम"},"help":{"en":"As printed on your marksheet.","hi":"जैसा आपकी मार्कशीट पर छपा है।"},"sources":["marksheet.student_name","id_proof.full_name"]},{"key":"father_name","type":"text","required":true,"sensitive":false,"label":{"en":"Father's or guardian's name","hi":"पिता या अभिभावक का नाम"},"sources":["marksheet.father_name","income_certificate.parent_name"]},{"key":"date_of_birth","type":"date","required":true,"sensitive":true,"label":{"en":"Date of birth","hi":"जन्म तिथि"},"sources":["id_proof.date_of_birth","marksheet.date_of_birth"]},{"key":"gender","type":"enum","required":true,"sensitive":false,"label":{"en":"Gender","hi":"लिंग"},"options":["Female","Male","Other"],"sources":["id_proof.gender"]},{"key":"category","type":"enum","required":true,"sensitive":false,"label":{"en":"Social category","hi":"सामाजिक वर्ग"},"help":{"en":"Pick the category on your caste or EWS certificate. Choose General if you have none.","hi":"अपने जाति या EWS प्रमाणपत्र वाला वर्ग चुनें। अगर कोई प्रमाणपत्र नहीं है तो सामान्य (General) चुनें।"},"options":["General","OBC","SC","ST","EWS"],"sources":[]},{"key":"mobile","type":"phone","required":true,"sensitive":true,"label":{"en":"Mobile number","hi":"मोबाइल नंबर"},"help":{"en":"10 digits. The demo portal pretends to send an OTP here.","hi":"10 अंक। डेमो पोर्टल इस नंबर पर OTP भेजने का अभिनय करता है।"},"sources":[]},{"key":"email","type":"email","required":true,"sensitive":true,"label":{"en":"Email address","hi":"ईमेल पता"},"sources":[]},{"key":"demo_id","type":"text","required":true,"sensitive":true,"label":{"en":"Demo ID","hi":"डेमो आईडी"},"help":{"en":"The fictional ID on your sample ID card, like DEMO-1234-5678. Never your Aadhaar number.","hi":"आपके सैंपल पहचान पत्र पर लिखी काल्पनिक आईडी, जैसे DEMO-1234-5678। कभी भी आपका आधार नंबर नहीं।"},"pattern":"^DEMO-\\d{4}-\\d{4}$","sources":["id_proof.demo_id"]},{"key":"state","type":"enum","required":true,"sensitive":false,"label":{"en":"State of residence","hi":"निवास का राज्य"},"optionsRef":"indianStates","sources":["id_proof.state"]},{"key":"district","type":"text","required":true,"sensitive":false,"label":{"en":"District","hi":"ज़िला"},"sources":["id_proof.district"]},{"key":"institution_name","type":"text","required":true,"sensitive":false,"label":{"en":"College or institution","hi":"कॉलेज या संस्थान"},"sources":["marksheet.institution_name"]},{"key":"course","type":"text","required":true,"sensitive":false,"label":{"en":"Course you are studying now","hi":"अभी आप कौन-सा कोर्स पढ़ रहे हैं"},"help":{"en":"For example: B.Sc. Physics","hi":"उदाहरण: बी.एससी. भौतिकी"},"sources":[]},{"key":"year_of_study","type":"enum","required":true,"sensitive":false,"label":{"en":"Year of study","hi":"पढ़ाई का वर्ष"},"options":["1","2","3","4","5"],"sources":[]},{"key":"previous_exam","type":"text","required":true,"sensitive":false,"label":{"en":"Last exam passed","hi":"पिछली उत्तीर्ण परीक्षा"},"sources":["marksheet.exam_name"]},{"key":"board","type":"text","required":true,"sensitive":false,"label":{"en":"Board or university","hi":"बोर्ड या विश्वविद्यालय"},"sources":["marksheet.board_name"]},{"key":"passing_year","type":"year","required":true,"sensitive":false,"label":{"en":"Year of passing","hi":"उत्तीर्ण होने का वर्ष"},"sources":["marksheet.passing_year"]},{"key":"previous_percentage","type":"percentage","required":true,"sensitive":false,"label":{"en":"Percentage of marks","hi":"अंकों का प्रतिशत"},"sources":["marksheet.percentage"]},{"key":"annual_family_income","type":"currency","required":true,"sensitive":true,"label":{"en":"Annual family income (₹)","hi":"परिवार की सालाना आय (₹)"},"sources":["income_certificate.annual_income"]},{"key":"income_certificate_number","type":"text","required":true,"sensitive":true,"label":{"en":"Income certificate number","hi":"आय प्रमाणपत्र संख्या"},"sources":["income_certificate.certificate_number"]},{"key":"bank_account_holder","type":"text","required":true,"sensitive":false,"label":{"en":"Bank account holder name","hi":"बैंक खाताधारक का नाम"},"sources":[]},{"key":"bank_account_number","type":"digits","required":true,"sensitive":true,"label":{"en":"Bank account number","hi":"बैंक खाता संख्या"},"pattern":"^\\d{9,18}$","sources":[]},{"key":"bank_ifsc","type":"text","required":true,"sensitive":false,"label":{"en":"Bank IFSC code","hi":"बैंक IFSC कोड"},"pattern":"^[A-Za-z]{4}0[A-Za-z0-9]{6}$","sources":[]}],"requiredDocs":[{"kind":"marksheet","label":{"en":"Latest marksheet","hi":"नवीनतम मार्कशीट"},"hint":{"en":"Your Class XII marksheet, or the last exam you passed.","hi":"आपकी कक्षा 12 की मार्कशीट, या पिछली उत्तीर्ण परीक्षा की।"},"maxBytes":2097152,"mimeTypes":["application/pdf","image/jpeg","image/png"],"uploadToPortal":true,"extract":[{"key":"student_name","description":"Student or candidate name"},{"key":"father_name","description":"Father's or guardian's name"},{"key":"date_of_birth","description":"Date of birth, as ISO yyyy-mm-dd"},{"key":"institution_name","description":"School, college or institution name"},{"key":"exam_name","description":"Name of the examination"},{"key":"board_name","description":"Board or university that issued it"},{"key":"passing_year","description":"Year of passing, four digits"},{"key":"percentage","description":"Overall percentage as a plain number, no % sign"}]},{"kind":"income_certificate","label":{"en":"Income certificate","hi":"आय प्रमाणपत्र"},"hint":{"en":"Issued for your family in the last 12 months.","hi":"पिछले 12 महीनों में आपके परिवार के लिए जारी किया गया।"},"maxBytes":2097152,"mimeTypes":["application/pdf","image/jpeg","image/png"],"uploadToPortal":true,"extract":[{"key":"certificate_number","description":"Certificate or reference number"},{"key":"parent_name","description":"Name of the parent the certificate is issued to"},{"key":"annual_income","description":"Annual family income in rupees, digits only"}]},{"kind":"id_proof","label":{"en":"Demo ID card","hi":"डेमो पहचान पत्र"},"hint":{"en":"The fictional sample ID for this demo. Please do not upload an Aadhaar card.","hi":"इस डेमो के लिए काल्पनिक सैंपल आईडी। कृपया आधार कार्ड अपलोड न करें।"},"maxBytes":2097152,"mimeTypes":["application/pdf","image/jpeg","image/png"],"uploadToPortal":false,"extract":[{"key":"demo_id","description":"Demo ID in the form DEMO-1234-5678"},{"key":"full_name","description":"Name of the card holder"},{"key":"date_of_birth","description":"Date of birth, as ISO yyyy-mm-dd"},{"key":"gender","description":"Female, Male or Other"},{"key":"state","description":"State in the address"},{"key":"district","description":"District in the address"}]}],"eligibility":{"rules":[{"id":"adult","field":"date_of_birth","op":"ageBetween","value":[18,30],"label":{"en":"Age between 18 and 30","hi":"आयु 18 से 30 वर्ष के बीच"}},{"id":"domicile","field":"state","op":"in","value":["Maharashtra","Karnataka","Rajasthan","Uttar Pradesh","West Bengal"],"label":{"en":"Lives in a participating state (Maharashtra, Karnataka, Rajasthan, Uttar Pradesh or West Bengal)","hi":"किसी सहभागी राज्य (महाराष्ट्र, कर्नाटक, राजस्थान, उत्तर प्रदेश या पश्चिम बंगाल) में रहते हैं"}},{"id":"income","field":"annual_family_income","op":"lte","value":250000,"label":{"en":"Family income up to ₹2,50,000 a year","hi":"परिवार की सालाना आय ₹2,50,000 तक"}},{"id":"marks","field":"previous_percentage","op":"gte","value":50,"label":{"en":"At least 50% in the last exam","hi":"पिछली परीक्षा में कम से कम 50%"}}]},"workflow":{"startPath":"/demo-portal/login","sessionExpired":{"urlIncludes":"/demo-portal/login","loginStep":"login"},"errorSelector":".error-summary, [role=alert]","steps":[{"id":"login","title":{"en":"Signing in to the portal","hi":"पोर्टल में साइन इन"},"goal":"Log in to the portal with the applicant's Demo ID and date of birth.","phase":"execute","actions":[{"do":"goto","path":"/demo-portal/login","passChaos":true},{"do":"fill","field":"demo_id","selector":"#demo_id","label":"Demo ID"},{"do":"fill","field":"date_of_birth","selector":"#login_dob","label":"Date of Birth","format":"dd/mm/yyyy"},{"do":"human","kind":"captcha","promptSelector":"#captcha_question","inputSelector":"#captcha_answer","whenVisible":"#captcha_answer"},{"do":"click","selector":"#login_btn","label":"Login"}],"allowedClicks":["Login"],"done":{"urlNotIncludes":"/demo-portal/login"}},{"id":"start_application","title":{"en":"Opening the application form","hi":"आवेदन फ़ॉर्म खोल रहे हैं"},"goal":"Open the scholarship application form from the applicant home page.","phase":"execute","actions":[{"do":"click","selector":"#apply_link","label":"Apply"}],"allowedClicks":["Apply","Continue application"],"done":{"urlIncludes":"/demo-portal/apply/"}},{"id":"personal","title":{"en":"Personal details","hi":"व्यक्तिगत विवरण"},"goal":"Fill the personal details section and save it.","phase":"execute","note":"Date of birth is typed as stored (ISO). The portal accepts it normally; in chaos mode its strict DD/MM/YYYY mask rejects it and recovery corrects the format.","actions":[{"do":"fill","field":"full_name","selector":"#applicant_name","label":"Applicant Name"},{"do":"fill","field":"father_name","selector":"#father_name","label":"Father's / Guardian's Name"},{"do":"fill","field":"date_of_birth","selector":"#dob","label":"Date of Birth"},{"do":"select","field":"gender","selector":"#gender","label":"Gender"},{"do":"select","field":"category","selector":"#category","label":"Category"},{"do":"fill","field":"mobile","selector":"#mobile","label":"Mobile Number"},{"do":"fill","field":"email","selector":"#email","label":"Email Address"},{"do":"click","selector":"#save_next","label":"Save & Next"}],"allowedClicks":["Save & Next"],"done":{"urlIncludes":"/demo-portal/apply/2"}},{"id":"institution","title":{"en":"Address and college","hi":"पता और कॉलेज"},"goal":"Choose state, district and institution, then fill course details and save.","phase":"execute","actions":[{"do":"select","field":"state","selector":"#state","label":"State"},{"do":"select","field":"district","selector":"#district","label":"District","waitForOptions":true},{"do":"select","field":"institution_name","selector":"#institution","label":"Institution","waitForOptions":true},{"do":"fill","field":"course","selector":"#course","label":"Course Name"},{"do":"select","field":"year_of_study","selector":"#year_of_study","label":"Year of Study"},{"do":"click","selector":"#save_next","label":"Save & Next"}],"allowedClicks":["Save & Next"],"done":{"urlIncludes":"/demo-portal/apply/3"}},{"id":"academic","title":{"en":"Marks and family income","hi":"अंक और पारिवारिक आय"},"goal":"Fill the academic and income section and save it.","phase":"execute","actions":[{"do":"fill","field":"previous_exam","selector":"#previous_exam","label":"Last Qualifying Examination"},{"do":"fill","field":"board","selector":"#board","label":"Board / University"},{"do":"fill","field":"passing_year","selector":"#passing_year","label":"Year of Passing"},{"do":"fill","field":"previous_percentage","selector":"#percentage","label":"Percentage of Marks"},{"do":"fill","field":"annual_family_income","selector":"#annual_income","label":"Annual Family Income","format":"digits"},{"do":"fill","field":"income_certificate_number","selector":"#income_cert_no","label":"Income Certificate Number"},{"do":"click","selector":"#save_next","label":"Save & Next"}],"allowedClicks":["Save & Next"],"done":{"urlIncludes":"/demo-portal/apply/4"}},{"id":"bank","title":{"en":"Bank details","hi":"बैंक विवरण"},"goal":"Fill the bank account section and save it.","phase":"execute","actions":[{"do":"fill","field":"bank_account_holder","selector":"#acc_holder","label":"Account Holder Name"},{"do":"fill","field":"bank_account_number","selector":"#acc_number","label":"Bank Account Number"},{"do":"fill","field":"bank_account_number","selector":"#acc_number_confirm","label":"Confirm Account Number"},{"do":"fill","field":"bank_ifsc","selector":"#ifsc","label":"IFSC Code","format":"upper"},{"do":"click","selector":"#save_next","label":"Save & Next"}],"allowedClicks":["Save & Next"],"done":{"urlIncludes":"/demo-portal/apply/5"}},{"id":"documents","title":{"en":"Uploading your documents","hi":"आपके दस्तावेज़ अपलोड कर रहे हैं"},"goal":"Attach the marksheet and income certificate exactly as the applicant uploaded them.","phase":"execute","actions":[{"do":"upload","doc":"marksheet","selector":"#marksheet_file","label":"Upload Marksheet"},{"do":"upload","doc":"income_certificate","selector":"#income_file","label":"Upload Income Certificate"},{"do":"click","selector":"#upload_next","label":"Upload & Next"}],"allowedClicks":["Upload & Next"],"done":{"urlIncludes":"/demo-portal/apply/6"}},{"id":"verify_mobile","title":{"en":"Mobile OTP check","hi":"मोबाइल OTP जाँच"},"goal":"Request an OTP and enter the code the applicant provides.","phase":"execute","actions":[{"do":"click","selector":"#send_otp","label":"Send OTP"},{"do":"human","kind":"otp","promptSelector":"#otp_message","inputSelector":"#otp"},{"do":"click","selector":"#verify_otp","label":"Verify OTP"}],"allowedClicks":["Send OTP","Verify OTP","Resend OTP"],"done":{"urlIncludes":"/demo-portal/apply/7"}},{"id":"review","title":{"en":"Your final review","hi":"आपकी अंतिम समीक्षा"},"goal":"Show every value to the applicant and wait for their approval.","phase":"approve","actions":[{"do":"approve","kind":"final_submit","summarySelector":"#preview_table"}],"allowedClicks":[],"done":{"approved":true}},{"id":"submit","title":{"en":"Submitting the application","hi":"आवेदन जमा कर रहे हैं"},"goal":"Tick the declaration and press Final Submit once.","phase":"submit","actions":[{"do":"check","selector":"#declaration","label":"I hereby declare","requiresApproval":true},{"do":"submit","selector":"#final_submit","label":"Final Submit","requiresApproval":true}],"allowedClicks":[],"done":{"urlIncludes":"/demo-portal/acknowledgement"},"capture":{"trackingId":"#tracking_id"}}]}}$svc$::jsonb, true)
on conflict (slug) do update set definition = excluded.definition, enabled = excluded.enabled, updated_at = now();
