-- Audit follow-ups (docs/audit/REMEDIATION_LOG.md, A-RISK-01 and A-RISK-03).

-- =========================================================
-- 1. A-RISK-01: no clock-in on a shift already marked no-show (decision 11 Oct 2026: refuse).
--    detect_no_shows() marks a shift no_show 30 minutes after start and opens a replacement. A clock-in
--    after that used to be accepted while the shift stayed no_show — an attendance that could never be
--    billed, next to a replacement the PIC was already filling. Now the SPG is told to call the PIC, who
--    decides what happens to the day.
-- =========================================================
create or replace function public.attendances_server_checks() returns trigger
language plpgsql security definer set search_path = public as $$
declare s record; v record;
begin
  new.received_at := now();
  new.geo_valid := false; new.distance_m := null; new.late_min := 0; new.auto_closed := false;
  if new.clock_in_at > now() + interval '5 minutes' or new.clock_in_at < now() - public.max_offline_age() then
    raise exception 'Waktu clock-in di luar batas — periksa tanggal & jam HP.';
  end if;
  select * into s from public.shifts where id = new.shift_id;
  if s.spg_id <> new.user_id then raise exception 'Shift ini bukan milik Anda.'; end if;
  if s.status in ('cancelled','replaced') then raise exception 'Shift ini sudah dibatalkan atau diganti.'; end if;
  if s.status = 'no_show' then
    raise exception 'Shift ini sudah ditandai tidak hadir (lebih dari 30 menit setelah jam mulai). Hubungi PIC.';
  end if;
  if public.wib(new.clock_in_at)::date <> s.shift_date then
    raise exception 'Clock-in harus pada tanggal shift.';
  end if;
  select * into v from public.venues where id = s.venue_id;
  new.distance_m := round(public.haversine_m(v.lat, v.lng, new.clock_in_lat, new.clock_in_lng)::numeric);
  new.geo_valid := not new.mocked and new.distance_m <= v.radius_m;
  new.late_min := greatest(0, floor(extract(epoch from (public.wib(new.clock_in_at) - (s.shift_date + s.planned_start))) / 60))::int;
  return new;
end;
$$;
revoke execute on function public.attendances_server_checks() from public, anon, authenticated;

-- =========================================================
-- 2. A-RISK-03: resolving an exception that is already closed (two PICs on the same queue) silently did
--    nothing, and the second PIC was told it worked. Now they are told it was already closed.
-- =========================================================
create or replace function public.resolve_exception(p_id bigint, p_status text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_ops() then raise exception 'Hanya PIC yang bisa menyelesaikan exception.'; end if;
  if p_status not in ('resolved','waived') then raise exception 'Status tidak valid.'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'Catatan wajib diisi.'; end if;
  update public.exceptions set status = p_status, note = p_note, resolved_by = auth.uid(), resolved_at = now()
   where id = p_id and status = 'open';
  if not found then raise exception 'Exception ini sudah ditutup (mungkin oleh PIC lain) atau tidak ditemukan.'; end if;
end;
$$;
revoke execute on function public.resolve_exception(bigint, text, text) from public, anon;
