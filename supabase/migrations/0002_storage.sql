-- Private buckets for selfies and KPI proof photos (Supabase only — skipped by scripts/test-db.sh).
-- Paths are always '<owner uid>/<attendance or kpi id>.jpg'; the app opens them through signed URLs.
--   selfies   : owner + SPC staff. Never grab_viewer (personal data, UU PDP).
--   kpi-proof : owner + SPC staff + grab_viewer (proof photos must not show customer data).
-- Evidence is append-only: no update or delete policies for end users.

insert into storage.buckets (id, name, public) values
  ('selfies', 'selfies', false),
  ('kpi-proof', 'kpi-proof', false)
on conflict (id) do update set public = false;

create policy selfies_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'selfies' and (storage.foldername(name))[1] = auth.uid()::text
              and public.current_role() = 'spg');
create policy selfies_read on storage.objects for select to authenticated
  using (bucket_id = 'selfies' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff()));

create policy proof_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'kpi-proof' and (storage.foldername(name))[1] = auth.uid()::text
              and public.current_role() = 'spg');
create policy proof_read on storage.objects for select to authenticated
  using (bucket_id = 'kpi-proof' and ((storage.foldername(name))[1] = auth.uid()::text or public.can_monitor()));
