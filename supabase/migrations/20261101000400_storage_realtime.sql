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
