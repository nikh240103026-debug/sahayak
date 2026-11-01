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
