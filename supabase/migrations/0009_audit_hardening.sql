-- Audit hardening (11 Oct 2026, docs/audit/REMEDIATION_LOG.md). The RLS policies decide WHO may write a
-- row; these guards decide WHICH columns an API caller may set, so the numbers that feed the invoice,
-- the hiring SLA and the UU PDP consent can only be produced by the server's own rules.
--
-- "API caller" = the PostgREST roles (authenticated / anon). Server functions (security definer, owned
-- by postgres), pg_cron jobs and the service role (edge functions) are not API callers: a trigger fired
-- from inside validate_shift(), detect_no_shows() or refresh_request_status() sees current_user = the
-- function owner, so the rules below never get in the way of the server doing its job.

create or replace function public.is_api_caller() returns boolean
language sql stable set search_path = public as $$
  select current_user in ('authenticated', 'anon')
$$;

-- =========================================================
-- 1. Shifts (A-DB-01): billable = done + validated + no open exception. Before this, the PIC could
--    insert a shift already 'done' and validated, or update status/validated_at directly, and the
--    unworked shift landed in billable_shifts and the payroll export. Done comes only from a
--    clock-out (attendances_flag_exceptions), validation only from validate_shift(), no-show only
--    from detect_no_shows(), replaced only from open_replacement(). The app's own writes are a
--    new planned shift and planned -> cancelled, which stay allowed.
-- =========================================================
create or replace function public.shifts_guard_api() returns trigger
language plpgsql set search_path = public as $$
begin
  if not public.is_api_caller() then return new; end if;
  if tg_op = 'INSERT' then
    new.status := 'planned';
    new.validated_at := null;
    new.validated_by := null;
    return new;
  end if;
  if new.status is distinct from old.status
     and not (old.status = 'planned' and new.status = 'cancelled') then
    raise exception 'Status shift diatur server (clock-out, validasi, no-show, penggantian). Hanya shift terjadwal yang bisa dibatalkan.';
  end if;
  if (new.validated_at, new.validated_by, new.overtime_hours, new.replaces_shift_id)
     is distinct from (old.validated_at, old.validated_by, old.overtime_hours, old.replaces_shift_id) then
    raise exception 'Validasi, jam lembur dan penggantian shift diatur server.';
  end if;
  return new;
end;
$$;
revoke execute on function public.shifts_guard_api() from public, anon, authenticated;
-- Name sorts before shifts_server_checks, so overtime is recomputed after this guard on insert.
create trigger shifts_guard_api before insert or update on public.shifts
  for each row execute function public.shifts_guard_api();

-- =========================================================
-- 2. Requests (A-DB-02): the hiring SLA is measured once, by the server. An API caller could insert a
--    request with staffed_at already set, or move sla_hiring_due / submitted_at / staffed_at later,
--    and the SLA report showed "met". Status moves through refresh_request_status(); the only status
--    an API caller sets is 'cancelled' (cancelRequest in the app).
-- =========================================================
create or replace function public.requests_guard_api() returns trigger
language plpgsql set search_path = public as $$
begin
  if not public.is_api_caller() then return new; end if;
  if tg_op = 'INSERT' then
    new.staffed_at := null;
    return new;
  end if;
  if (new.submitted_at, new.submitted_by, new.sla_hiring_due, new.staffed_at)
     is distinct from (old.submitted_at, old.submitted_by, old.sla_hiring_due, old.staffed_at) then
    raise exception 'Waktu masuk, batas SLA dan waktu terisi request diatur server.';
  end if;
  if new.status is distinct from old.status and new.status <> 'cancelled' then
    raise exception 'Status request diatur server; yang bisa dilakukan hanya membatalkan.';
  end if;
  return new;
end;
$$;
revoke execute on function public.requests_guard_api() from public, anon, authenticated;
create trigger requests_guard_api before insert or update on public.requests
  for each row execute function public.requests_guard_api();

-- =========================================================
-- 3. Selfies (A-DB-03): the clock-in selfie is evidence. media_update lets the SPG write the row while
--    the shift is open (for a clock-out selfie), which also let them point selfie_in_path at a photo
--    uploaded later. The clock-in selfie and the attendance link are now fixed once written.
-- =========================================================
create or replace function public.attendance_media_guard_api() returns trigger
language plpgsql set search_path = public as $$
begin
  if public.is_api_caller()
     and (new.attendance_id, new.selfie_in_path) is distinct from (old.attendance_id, old.selfie_in_path) then
    raise exception 'Selfie clock-in tidak bisa diganti.';
  end if;
  return new;
end;
$$;
revoke execute on function public.attendance_media_guard_api() from public, anon, authenticated;
create trigger attendance_media_guard_api before update on public.attendance_media
  for each row execute function public.attendance_media_guard_api();

-- =========================================================
-- 4. Consent (A-DB-04): UU PDP consent is given by the person whose data is processed. Staff can update
--    any profile (profiles_update), so a PIC or back office could set an SPG's consent_version and the
--    clock-in consent gate (attendances_require_consent) passed without the SPG ever agreeing.
-- =========================================================
create or replace function public.profiles_guard_consent() returns trigger
language plpgsql set search_path = public as $$
begin
  if public.is_api_caller() and new.consent_version is distinct from old.consent_version
     and new.id is distinct from auth.uid() then
    raise exception 'Persetujuan data hanya bisa diberikan atau dicabut oleh pemilik akun.';
  end if;
  return new;
end;
$$;
revoke execute on function public.profiles_guard_consent() from public, anon, authenticated;
create trigger profiles_guard_consent before update of consent_version on public.profiles
  for each row execute function public.profiles_guard_consent();

-- =========================================================
-- 5. Daily report (A-DB-05): 'planned' counted shifts taken off the roster by a replacement
--    (status 'replaced') next to the shift that replaced them, so one roster slot counted twice.
--    Same rule as the app's roster (isLive) and refresh_request_status: cancelled and replaced
--    shifts are not on the roster. A no-show stays planned (it was on the roster and missed).
-- =========================================================
create or replace function public.build_daily_report(p_date date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t jsonb;
begin
  select jsonb_build_object(
    'planned',       count(*) filter (where s.status not in ('cancelled','replaced')),
    'attended',      count(a.id),
    'no_show',       count(*) filter (where s.status = 'no_show'),
    'geo_valid',     count(a.id) filter (where a.geo_valid),
    'open_exceptions', (select count(*) from public.exceptions e join public.shifts x on x.id = e.shift_id
                         where x.shift_date = p_date and e.status = 'open'),
    'kpi', coalesce((select jsonb_object_agg(field_key, total) from (
              select k.field_key, sum(k.value) total from public.kpi_logs k
                join public.shifts x on x.id = k.shift_id where x.shift_date = p_date
               group by k.field_key) q), '{}'::jsonb))
    into t
    from public.shifts s left join public.attendances a on a.shift_id = s.id
   where s.shift_date = p_date;
  insert into public.daily_reports (report_date, totals) values (p_date, t)
  on conflict (report_date) do update set totals = excluded.totals, generated_at = now()
    where public.daily_reports.published_at is null;
  return t;
end;
$$;
revoke execute on function public.build_daily_report(date) from public, anon, authenticated;
