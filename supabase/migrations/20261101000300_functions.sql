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
