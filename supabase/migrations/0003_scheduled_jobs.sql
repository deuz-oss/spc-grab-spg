-- Server jobs: auto-close forgotten sessions, retention purge, and the pg_cron schedule.
-- The functions are plain SQL (testable anywhere); scheduling only happens where pg_cron exists.

-- Attendances left open for more than 16 hours are closed at the last recorded activity.
-- A real clock-out synced later still replaces it (attendances_guard_update allows that once).
create or replace function public.auto_close_attendances() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with stale as (
    select a.id,
           greatest(a.clock_in_at,
                    coalesce((select max(r.recorded_at) from public.route_points r where r.attendance_id = a.id), a.clock_in_at),
                    coalesce((select max(k.logged_at) from public.kpi_logs k where k.shift_id = a.shift_id), a.clock_in_at)) as last_seen
      from public.attendances a
     where a.clock_out_at is null and a.clock_in_at < now() - interval '16 hours')
  update public.attendances a set clock_out_at = s.last_seen, auto_closed = true
    from stale s where a.id = s.id;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Retention (decision D5, approved 9 Oct 2026): selfie references and GPS trails older than
-- 12 months are deleted. Attendance, KPI and billing rows stay (they back invoices).
-- The storage objects themselves are removed by the purge-media edge function, which reads
-- media_purge_queue; this keeps storage deletes out of SQL.
create table if not exists public.media_purge_queue (
  bucket    text not null,
  path      text not null,
  queued_at timestamptz not null default now(),
  primary key (bucket, path)
);
alter table public.media_purge_queue enable row level security;  -- no policies: service role only

create or replace function public.retention_months() returns int language sql immutable as $$ select 12 $$;

create or replace function public.purge_expired_personal_data() returns jsonb
language plpgsql security definer set search_path = public as $$
declare cutoff timestamptz := now() - make_interval(months => public.retention_months());
        n_media int; n_route int;
begin
  insert into public.media_purge_queue (bucket, path)
    select 'selfies', p from public.attendance_media m join public.attendances a on a.id = m.attendance_id,
           unnest(array[m.selfie_in_path, m.selfie_out_path]) p
     where a.clock_in_at < cutoff and p is not null
  on conflict do nothing;
  delete from public.attendance_media m using public.attendances a
   where a.id = m.attendance_id and a.clock_in_at < cutoff;
  get diagnostics n_media = row_count;
  delete from public.route_points where recorded_at < cutoff;
  get diagnostics n_route = row_count;
  return jsonb_build_object('selfie_rows', n_media, 'route_points', n_route);
end;
$$;

revoke execute on function public.auto_close_attendances() from public, anon, authenticated;
revoke execute on function public.purge_expired_personal_data() from public, anon, authenticated;

-- Schedule (UTC cron; WIB = UTC+7). Skipped quietly where pg_cron is not installed.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('grab-no-shows',     '*/5 * * * *', 'select public.detect_no_shows()');
    perform cron.schedule('grab-auto-close',   '7 * * * *',   'select public.auto_close_attendances()');
    -- 06:00 WIB = 23:00 UTC: build yesterday's (WIB) report for the PIC to publish by 10:00
    perform cron.schedule('grab-daily-report', '0 23 * * *',
      $job$select public.build_daily_report((now() at time zone 'Asia/Jakarta')::date - 1)$job$);
    perform cron.schedule('grab-retention',    '30 19 * * *', 'select public.purge_expired_personal_data()');
  else
    raise notice 'pg_cron not available: jobs not scheduled';
  end if;
end;
$$;
