-- Clock-in GPS accuracy (phone test 15 Oct 2026, bug B1).
-- The app now sends the accuracy the phone reports for the clock-in fix. When a high-accuracy fix
-- times out indoors the app falls back to a network position that can be off by kilometres; without
-- the accuracy the PIC cannot tell "SPG not at the venue" from "phone did not know where it was".
-- Geofence rules do not change: distance and geo_valid are still computed by the server from the
-- clock-in point, whatever the accuracy.
--
-- 1. accuracy_m is evidence like the clock-in point: never negative, and fixed once written
--    (attendances_guard_update did not list it).
-- 2. The off-site exception names the accuracy, e.g. "Jarak 15164 m dari venue (akurasi ±2000 m)".

alter table public.attendances
  add constraint attendances_accuracy_m_check check (accuracy_m is null or accuracy_m >= 0);

create or replace function public.attendances_guard_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null then
    if (new.shift_id, new.user_id, new.clock_in_at, new.clock_in_lat, new.clock_in_lng, new.accuracy_m, new.mocked,
        new.distance_m, new.geo_valid, new.late_min, new.received_at)
       is distinct from
       (old.shift_id, old.user_id, old.clock_in_at, old.clock_in_lat, old.clock_in_lng, old.accuracy_m, old.mocked,
        old.distance_m, old.geo_valid, old.late_min, old.received_at) then
      raise exception 'Data clock-in tidak bisa diubah.';
    end if;
    if old.clock_out_at is not null and not old.auto_closed then
      raise exception 'Clock-out sudah tercatat.';
    end if;
    if new.clock_out_at is null or new.clock_out_at < old.clock_in_at or new.clock_out_at > now() + interval '5 minutes' then
      raise exception 'Waktu clock-out tidak valid.';
    end if;
    new.auto_closed := false;
  end if;
  return new;
end;
$$;
revoke execute on function public.attendances_guard_update() from public, anon, authenticated;

create or replace function public.attendances_flag_exceptions() returns trigger
language plpgsql security definer set search_path = public as $$
declare s record; worked interval; planned interval;
begin
  if tg_op = 'INSERT' then
    if not new.geo_valid then
      perform public.raise_exception_row(new.shift_id, 'off_site',
        case when new.mocked then 'Lokasi palsu terdeteksi'
             else 'Jarak ' || coalesce(new.distance_m::text, '?') || ' m dari venue'
                  || coalesce(' (akurasi ±' || round(new.accuracy_m)::text || ' m)', '') end);
    end if;
    if new.late_min > public.late_threshold_min() then
      perform public.raise_exception_row(new.shift_id, 'late', 'Terlambat ' || new.late_min || ' menit');
    end if;
    if new.received_at - new.clock_in_at > public.late_sync_after() then
      perform public.raise_exception_row(new.shift_id, 'late_sync', 'Data masuk terlambat');
    end if;
  elsif new.clock_out_at is not null and (old.clock_out_at is null or old.auto_closed) then
    select * into s from public.shifts where id = new.shift_id;
    update public.shifts set status = 'done' where id = new.shift_id and status = 'planned';
    if new.auto_closed then
      perform public.raise_exception_row(new.shift_id, 'no_clock_out', 'Ditutup otomatis — SPG tidak clock-out');
    end if;
    worked := new.clock_out_at - new.clock_in_at;
    planned := (s.planned_end - s.planned_start);
    if worked < planned - interval '30 minutes' then
      perform public.raise_exception_row(new.shift_id, 'short_shift',
        'Bekerja ' || to_char(worked, 'HH24:MI') || ' dari ' || to_char(planned, 'HH24:MI'));
    end if;
  end if;
  return null;
end;
$$;
revoke execute on function public.attendances_flag_exceptions() from public, anon, authenticated;
