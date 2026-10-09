-- SPG photo for the roster Grab confirms one day before start (R3). Supabase only — skipped by scripts/test-db.sh.
-- Taken by back office at onboarding; path '<spg uid>/<file>.jpg'. Not a selfie: no GPS, no attendance link.
insert into storage.buckets (id, name, public) values ('profile-photos', 'profile-photos', false)
on conflict (id) do update set public = false;

create policy profile_photo_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'profile-photos' and public.is_staff());
create policy profile_photo_update on storage.objects for update to authenticated
  using (bucket_id = 'profile-photos' and public.is_staff())
  with check (bucket_id = 'profile-photos' and public.is_staff());
create policy profile_photo_read on storage.objects for select to authenticated
  using (bucket_id = 'profile-photos'
         and ((storage.foldername(name))[1] = (select auth.uid())::text or public.can_monitor()));
