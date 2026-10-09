-- Core loop (spec phase 19–24 Oct): request lifecycle, replacements, consent gate, SPG photo,
-- plus the performance advisor's findings on staging (FK indexes, per-row auth.uid()).

-- =========================================================
-- 1. Request lifecycle: new -> staffed -> running -> closed (R1, R2)
-- =========================================================
-- staffed_at is the SLA hiring stop: the first moment every date of the request has
-- `headcount` SPG scheduled. It is never moved back once set (SLA is measured once).
create or replace function public.refresh_request_status(p_request text) returns void
language plpgsql security definer set search_path = public as $$
declare r record; fully boolean; any_shift boolean; today date := public.wib(now())::date; st text;
begin
  select * into r from public.requests where id = p_request;
  if not found or r.status = 'cancelled' then return; end if;
  select coalesce(bool_and(c >= r.headcount), false) into fully from (
    select (select count(*) from public.shifts s
             where s.request_id = r.id and s.shift_date = d::date and s.status not in ('cancelled','replaced')) c
      from generate_series(r.start_date, r.end_date, interval '1 day') d) x;
  select exists (select 1 from public.shifts s where s.request_id = r.id and s.status not in ('cancelled','replaced'))
    into any_shift;
  st := case when today > r.end_date then 'closed'
             when today >= r.start_date and any_shift then 'running'
             when fully then 'staffed'
             else 'new' end;
  update public.requests
     set status = st,
         staffed_at = case when fully then coalesce(staffed_at, now()) else staffed_at end
   where id = r.id
     and (status is distinct from st or (fully and staffed_at is null));
end;
$$;
revoke execute on function public.refresh_request_status(text) from public, anon, authenticated;

create or replace function public.shifts_refresh_request() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_request_status(new.request_id);
  return null;
end;
$$;
revoke execute on function public.shifts_refresh_request() from public, anon, authenticated;
create trigger shifts_refresh_request after insert or update of status, spg_id, shift_date on public.shifts
  for each row execute function public.shifts_refresh_request();

-- Dates roll over without any shift changing: a nightly pass moves requests to running / closed.
create or replace function public.roll_request_status() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id from public.requests where status not in ('closed','cancelled') loop
    perform public.refresh_request_status(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.roll_request_status() from public, anon, authenticated;

-- =========================================================
-- 2. Replacements (R7): opened automatically for no-shows, or by the PIC for
--    resignation / underperformance; filled by scheduling a shift that replaces it.
-- =========================================================
create or replace function public.open_replacement(p_shift text, p_reason text) returns text
language plpgsql security definer set search_path = public as $$
declare s record; rid text := 'rp_' || p_shift;
begin
  if not public.is_ops() then raise exception 'Hanya PIC yang bisa membuka penggantian.'; end if;
  if p_reason not in ('no_show','resignation','underperform') then raise exception 'Alasan tidak valid.'; end if;
  select * into s from public.shifts where id = p_shift;
  if not found then raise exception 'Shift tidak ditemukan.'; end if;
  if s.status in ('cancelled','replaced') then raise exception 'Shift ini sudah dibatalkan atau diganti.'; end if;
  insert into public.replacements (id, original_shift_id, reason, due_at)
    values (rid, p_shift, p_reason, now()) on conflict (original_shift_id) do nothing;
  -- A shift not worked yet is taken off the roster; a no-show stays as evidence (never billed).
  if s.status = 'planned' and not exists (select 1 from public.attendances a where a.shift_id = s.id) then
    update public.shifts set status = 'replaced' where id = s.id;
  end if;
  return rid;
end;
$$;
revoke execute on function public.open_replacement(text, text) from public, anon;

create or replace function public.shifts_check_replacement() returns trigger
language plpgsql security definer set search_path = public as $$
declare o record;
begin
  if new.replaces_shift_id is null then return new; end if;
  select * into o from public.shifts where id = new.replaces_shift_id;
  if o.request_id <> new.request_id then raise exception 'Pengganti harus untuk request yang sama.'; end if;
  if o.spg_id = new.spg_id then raise exception 'Pengganti harus SPG lain.'; end if;
  if not exists (select 1 from public.replacements where original_shift_id = new.replaces_shift_id and filled_at is null) then
    raise exception 'Tidak ada penggantian terbuka untuk shift ini.';
  end if;
  return new;
end;
$$;
revoke execute on function public.shifts_check_replacement() from public, anon, authenticated;
create trigger shifts_check_replacement before insert on public.shifts
  for each row execute function public.shifts_check_replacement();

create or replace function public.shifts_fill_replacement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.replaces_shift_id is not null then
    update public.replacements set filled_shift_id = new.id, filled_at = now()
     where original_shift_id = new.replaces_shift_id and filled_at is null;
  end if;
  return null;
end;
$$;
revoke execute on function public.shifts_fill_replacement() from public, anon, authenticated;
create trigger shifts_fill_replacement after insert on public.shifts
  for each row execute function public.shifts_fill_replacement();

-- =========================================================
-- 3. Consent (R16, UU PDP) and SPG photo for the roster Grab sees (R3)
-- =========================================================
alter table public.profiles add column if not exists photo_path text;

-- Consent time is stamped by the server whenever the version changes; nobody can backdate it.
create or replace function public.profiles_guard_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.consent_version is distinct from old.consent_version then
    new.consent_at := case when new.consent_version is null then null else now() end;
  else
    new.consent_at := old.consent_at;
  end if;
  if auth.uid() is not null and not coalesce(public.current_role() = 'super_admin', false) then
    if (new.role, new.active, new.username) is distinct from (old.role, old.active, old.username) then
      raise exception 'Role, status dan username hanya bisa diubah super admin.';
    end if;
    if auth.uid() = new.id and public.is_field()
       and (new.grade, new.contract_type, new.documents_ok, new.phone_ok, new.bpjs_registered, new.city_id, new.photo_path)
           is distinct from
           (old.grade, old.contract_type, old.documents_ok, old.phone_ok, old.bpjs_registered, old.city_id, old.photo_path) then
      raise exception 'Data ini diisi oleh back office.';
    end if;
  end if;
  return new;
end;
$$;

-- No clock-in (selfie + GPS) before the SPG has agreed to the processing.
create or replace function public.attendances_require_consent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = new.user_id and consent_version is not null) then
    raise exception 'Persetujuan pemrosesan data (UU PDP) belum diberikan.';
  end if;
  return new;
end;
$$;
revoke execute on function public.attendances_require_consent() from public, anon, authenticated;
create trigger attendances_require_consent before insert on public.attendances
  for each row execute function public.attendances_require_consent();

-- =========================================================
-- 4. Replacement insert by the PIC (the RPC above is the normal path)
-- =========================================================
create policy repl_insert on public.replacements for insert with check (public.is_ops());

-- =========================================================
-- 5. Performance advisor: index every foreign key, evaluate auth.uid() once per query
-- =========================================================
create index if not exists client_errors_user_idx      on public.client_errors(user_id);
create index if not exists daily_reports_pub_by_idx    on public.daily_reports(published_by);
create index if not exists exceptions_resolved_by_idx  on public.exceptions(resolved_by);
create index if not exists replacements_filled_idx     on public.replacements(filled_shift_id);
create index if not exists requests_campaign_idx       on public.requests(campaign_id);
create index if not exists requests_city_idx           on public.requests(city_id);
create index if not exists requests_submitted_by_idx   on public.requests(submitted_by);
create index if not exists requests_venue_idx          on public.requests(venue_id);
create index if not exists shifts_replaces_idx         on public.shifts(replaces_shift_id);
create index if not exists shifts_validated_by_idx     on public.shifts(validated_by);
create index if not exists shifts_venue_idx            on public.shifts(venue_id);
create index if not exists trainings_campaign_idx      on public.trainings(campaign_id);
create index if not exists trainings_recorded_by_idx   on public.trainings(recorded_by);
create index if not exists venues_created_by_idx       on public.venues(created_by);

alter policy profiles_read on public.profiles using (
  id = (select auth.uid()) or public.can_monitor()
  or (public.current_role() = 'coordinator' and city_id = public.current_city_id()));
alter policy profiles_update on public.profiles using (id = (select auth.uid()) or public.is_staff())
  with check (id = (select auth.uid()) or public.is_staff());
alter policy contacts_read on public.profile_contacts using (user_id = (select auth.uid()) or public.is_staff());
alter policy contacts_write on public.profile_contacts using (user_id = (select auth.uid()) or public.is_staff())
  with check (user_id = (select auth.uid()) or public.is_staff());
alter policy trainings_read on public.trainings using (spg_id = (select auth.uid()) or public.can_monitor());
alter policy trainings_write on public.trainings with check (public.is_staff() and recorded_by = (select auth.uid()));
alter policy att_insert on public.attendances with check (user_id = (select auth.uid()) and public.is_field());
alter policy att_update on public.attendances using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy media_read on public.attendance_media using (
  public.is_staff() or exists (select 1 from public.attendances a where a.id = attendance_id and a.user_id = (select auth.uid())));
alter policy media_insert on public.attendance_media with check (
  exists (select 1 from public.attendances a where a.id = attendance_id and a.user_id = (select auth.uid())));
alter policy media_update on public.attendance_media using (
  exists (select 1 from public.attendances a where a.id = attendance_id and a.user_id = (select auth.uid()) and a.clock_out_at is null))
  with check (exists (select 1 from public.attendances a where a.id = attendance_id and a.user_id = (select auth.uid())));
alter policy route_read on public.route_points using (user_id = (select auth.uid()) or public.is_staff());
alter policy route_insert on public.route_points with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.attendances a where a.id = attendance_id and a.user_id = (select auth.uid())));
alter policy kpi_insert on public.kpi_logs with check (spg_id = (select auth.uid()) and public.is_field());
alter policy client_errors_insert on public.client_errors with check (user_id = (select auth.uid()));

-- =========================================================
-- 6. Schedule (where pg_cron exists): 00:01 WIB = 17:01 UTC
-- =========================================================
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('grab-request-status', '1 17 * * *', 'select public.roll_request_status()');
  end if;
end;
$$;
