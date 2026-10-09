-- SPC Grab SPG — foundation schema (spec: "Spec — SPC Grab Field Platform", approved 9 Oct 2026).
--
-- One consolidated migration for a fresh Supabase project. It carries forward the
-- hardening lessons of spc-nc-workforce (migrations 0008, 0011, 0012, 0014, 0015, 0016)
-- instead of re-learning them:
--   * profiles start INACTIVE; role/active are only granted by the service role
--   * current_role() ignores inactive profiles
--   * field records are insert-only; clock-in fields are immutable
--   * geofence, lateness, overtime and SLA dates are computed by the server
--   * staff phone numbers live in profile_contacts, selfies in attendance_media,
--     so grab_viewer is PII-free by structure, not by UI
--   * one program clock: Asia/Jakarta (WIB)
--
-- Roles: super_admin, pic, back_office, coordinator, spg, grab_viewer.

-- =========================================================
-- 0. Helpers that need no tables
-- =========================================================
create or replace function public.wib(ts timestamptz) returns timestamp
language sql immutable as $$ select ts at time zone 'Asia/Jakarta' $$;

create or replace function public.haversine_m(lat1 double precision, lng1 double precision,
                                              lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
           power(sin(radians(lat2 - lat1) / 2), 2) +
           cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

-- Working days = Monday to Friday (proposal SLAs are in working days).
create or replace function public.add_working_days(p_from timestamptz, p_days int)
returns timestamptz language plpgsql immutable as $$
declare
  d date := public.wib(p_from)::date;
  added int := 0;
begin
  while added < p_days loop
    d := d + 1;
    if extract(isodow from d) < 6 then added := added + 1; end if;
  end loop;
  -- due at the end of that working day, WIB
  return (d + time '23:59:59') at time zone 'Asia/Jakarta';
end;
$$;

create or replace function public.grade_rank(p text) returns int
language sql immutable as $$ select case p when 'A' then 3 when 'B' then 2 when 'C' then 1 else 0 end $$;

create or replace function public.max_offline_age() returns interval
language sql immutable as $$ select interval '7 days' $$;

-- =========================================================
-- 1. Reference data
-- =========================================================
create table public.cities (
  id          text primary key,                -- e.g. 'kota-surabaya'
  name        text not null unique,            -- as in Grab's template
  province    text not null,
  umk         numeric not null check (umk > 0),
  capability  text not null default 'Weak' check (capability in ('Strong','Weak')),
  created_at  timestamptz not null default now()
);

create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  name            text not null,
  username        text not null unique,
  role            text not null default 'spg' check (role in
                    ('super_admin','pic','back_office','coordinator','spg','grab_viewer')),
  city_id         text references public.cities(id),
  active          boolean not null default false,
  -- Field-worker fields: SPG and city coordinators (senior SPG who also work shifts)
  grade           text check (grade in ('A','B','C')),
  contract_type   text check (contract_type in ('daily_worker','pkwt')),
  documents_ok    boolean not null default false,  -- KTP, diploma, references checked
  phone_ok        boolean not null default false,  -- smartphone meets the app's minimum
  bpjs_registered boolean not null default false,
  consent_version text,
  consent_at      timestamptz,
  created_at      timestamptz not null default now(),
  constraint field_fields_only_for_field check (role in ('spg','coordinator') or (grade is null and contract_type is null))
);
create index profiles_city_idx on public.profiles(city_id);

-- Staff PII kept out of profiles so grab_viewer can read names without phones.
create table public.profile_contacts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  phone   text not null
);

create or replace function public.current_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.current_city_id() returns text
language sql stable security definer set search_path = public as $$
  select city_id from public.profiles where id = auth.uid() and active
$$;

create or replace function public.is_ops() returns boolean          -- runs the program
language sql stable as $$ select coalesce(public.current_role() in ('super_admin','pic'), false) $$;

create or replace function public.is_staff() returns boolean        -- SPC office staff
language sql stable as $$ select coalesce(public.current_role() in ('super_admin','pic','back_office'), false) $$;

create or replace function public.is_field() returns boolean       -- works shifts: SPG and coordinators
language sql stable as $$ select coalesce(public.current_role() in ('spg','coordinator'), false) $$;

create or replace function public.can_monitor() returns boolean     -- reads program-wide data
language sql stable as $$ select coalesce(public.current_role() in ('super_admin','pic','back_office','grab_viewer'), false) $$;

create table public.venues (
  id           text primary key,
  city_id      text not null references public.cities(id),
  name         text not null,
  address      text not null default '',
  lat          double precision not null check (lat between -11.5 and 6.5),
  lng          double precision not null check (lng between 94 and 141.5),
  radius_m     int not null default 150 check (radius_m between 30 and 1000),
  active_from  date,
  active_to    date,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  check (active_to is null or active_from is null or active_to >= active_from)
);
create index venues_city_idx on public.venues(city_id);

-- kpi_fields: [{"key":"downloads","label":"App downloads","unit":"count","proof_required":true}, ...]
create table public.campaigns (
  id          text primary key,
  name        text not null,
  type        text not null check (type in ('user','merchant','driver','launch','event')),
  kpi_fields  jsonb not null default '[]'::jsonb check (jsonb_typeof(kpi_fields) = 'array'),
  starts_on   date not null,
  ends_on     date,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

-- =========================================================
-- 2. Requests, training, shifts
-- =========================================================
create table public.requests (
  id               text primary key,
  campaign_id      text not null references public.campaigns(id),
  city_id          text not null references public.cities(id),
  venue_id         text not null references public.venues(id),
  grade            text not null check (grade in ('A','B','C')),
  headcount        int not null check (headcount between 1 and 500),
  start_date       date not null,
  end_date         date not null,
  shift_hours      int not null check (shift_hours in (8, 10)),
  package          text not null check (package in ('daily','weekly','monthly')),
  status           text not null default 'new' check (status in ('new','staffed','running','closed','cancelled')),
  submitted_at     timestamptz not null default now(),
  submitted_by     uuid references public.profiles(id),
  sla_hiring_due   timestamptz,                  -- server-set
  staffed_at       timestamptz,
  notes            text not null default '',
  created_at       timestamptz not null default now(),
  check (end_date >= start_date)
);
create index requests_status_idx on public.requests(status);

create or replace function public.requests_server_fill() returns trigger
language plpgsql security definer set search_path = public as $$
declare cap text;
begin
  if tg_op = 'INSERT' then
    new.submitted_at := now();
    new.submitted_by := coalesce(auth.uid(), new.submitted_by);
    new.status := 'new';
  end if;
  if not exists (select 1 from public.venues v where v.id = new.venue_id and v.city_id = new.city_id) then
    raise exception 'Venue tidak berada di kota yang diminta.';
  end if;
  select capability into cap from public.cities where id = new.city_id;
  -- SLA hiring: upper bound of the proposal (Strong 5, Weak 10 working days)
  new.sla_hiring_due := public.add_working_days(new.submitted_at, case when cap = 'Strong' then 5 else 10 end);
  return new;
end;
$$;
create trigger requests_server_fill before insert or update of city_id, venue_id, submitted_at
  on public.requests for each row execute function public.requests_server_fill();

create table public.trainings (
  id          text primary key,
  spg_id      uuid not null references public.profiles(id),
  campaign_id text not null references public.campaigns(id),
  passed_at   timestamptz not null default now(),
  score       numeric check (score between 0 and 100),
  recorded_by uuid references public.profiles(id),
  unique (spg_id, campaign_id)
);

create table public.shifts (
  id                text primary key,
  request_id        text not null references public.requests(id),
  venue_id          text not null references public.venues(id),
  spg_id            uuid not null references public.profiles(id),
  shift_date        date not null,
  planned_start     time not null,
  planned_end       time not null,
  overtime_hours    int not null default 0,       -- server-set: 2 for a 10-hour shift
  status            text not null default 'planned'
                      check (status in ('planned','done','no_show','replaced','cancelled')),
  replaces_shift_id text references public.shifts(id),
  validated_at      timestamptz,
  validated_by      uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  check (planned_end > planned_start)
);
create unique index shifts_one_live_per_spg_day on public.shifts(spg_id, shift_date)
  where status not in ('cancelled','replaced');
create index shifts_date_idx on public.shifts(shift_date);
create index shifts_request_idx on public.shifts(request_id);

create or replace function public.shifts_server_checks() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record; p record;
begin
  select * into r from public.requests where id = new.request_id;
  if new.venue_id <> r.venue_id then raise exception 'Venue shift harus sama dengan venue request.'; end if;
  if new.shift_date not between r.start_date and r.end_date then
    raise exception 'Tanggal shift di luar periode request.';
  end if;
  -- Lawful hours: 10-hour shift = 8 normal + 2 overtime (approved 9 Oct 2026)
  new.overtime_hours := greatest(r.shift_hours - 8, 0);
  if tg_op = 'INSERT' or new.spg_id is distinct from old.spg_id then
    select * into p from public.profiles where id = new.spg_id;
    if p.role not in ('spg','coordinator') or not p.active then raise exception 'Hanya SPG/koordinator aktif yang bisa dijadwalkan.'; end if;
    if public.grade_rank(p.grade) < public.grade_rank(r.grade) then
      raise exception 'Grade SPG (%) di bawah grade request (%).', p.grade, r.grade;
    end if;
    if not exists (select 1 from public.trainings t where t.spg_id = new.spg_id and t.campaign_id = r.campaign_id) then
      raise exception 'SPG belum lulus training untuk campaign ini.';
    end if;
  end if;
  return new;
end;
$$;
create trigger shifts_server_checks before insert or update of spg_id, request_id, venue_id, shift_date
  on public.shifts for each row execute function public.shifts_server_checks();

-- =========================================================
-- 3. Attendance (clock in/out at the venue) and route
-- =========================================================
create table public.attendances (
  id             text primary key,
  shift_id       text not null unique references public.shifts(id),
  user_id        uuid not null references public.profiles(id),
  clock_in_at    timestamptz not null,
  clock_in_lat   double precision not null,
  clock_in_lng   double precision not null,
  accuracy_m     numeric,
  mocked         boolean not null default false,
  distance_m     numeric,                          -- server-set
  geo_valid      boolean not null default false,   -- server-set
  late_min       int not null default 0,           -- server-set
  clock_out_at   timestamptz,
  clock_out_lat  double precision,
  clock_out_lng  double precision,
  received_at    timestamptz not null default now(),
  auto_closed    boolean not null default false
);
create index attendances_user_idx on public.attendances(user_id);
create index attendances_open_idx on public.attendances(user_id) where clock_out_at is null;
alter table public.attendances replica identity full;

-- Selfies are personal data: owner and SPC staff only, never grab_viewer.
create table public.attendance_media (
  attendance_id  text primary key references public.attendances(id) on delete cascade,
  selfie_in_path text not null,
  selfie_out_path text
);

create table public.route_points (
  id            bigint generated always as identity primary key,
  attendance_id text not null references public.attendances(id) on delete cascade,
  user_id       uuid not null references public.profiles(id),
  lat           double precision not null,
  lng           double precision not null,
  recorded_at   timestamptz not null,
  unique (attendance_id, recorded_at)               -- idempotent offline replay
);
create index route_points_recent_idx on public.route_points(user_id, recorded_at desc);

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
create trigger attendances_server_checks before insert on public.attendances
  for each row execute function public.attendances_server_checks();

create or replace function public.attendances_guard_update() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null then
    if (new.shift_id, new.user_id, new.clock_in_at, new.clock_in_lat, new.clock_in_lng, new.mocked,
        new.distance_m, new.geo_valid, new.late_min, new.received_at)
       is distinct from
       (old.shift_id, old.user_id, old.clock_in_at, old.clock_in_lat, old.clock_in_lng, old.mocked,
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
create trigger attendances_guard_update before update on public.attendances
  for each row execute function public.attendances_guard_update();

-- =========================================================
-- 4. KPI logs
-- =========================================================
create table public.kpi_logs (
  id          text primary key,
  shift_id    text not null references public.shifts(id),
  spg_id      uuid not null references public.profiles(id),
  field_key   text not null,
  value       numeric not null check (value >= 0 and value <= 100000),
  proof_path  text,                                -- no customer PII allowed in proof photos (UU PDP)
  logged_at   timestamptz not null,
  received_at timestamptz not null default now(),
  unique (shift_id, field_key)
);
create index kpi_logs_spg_idx on public.kpi_logs(spg_id);

create or replace function public.kpi_logs_server_checks() returns trigger
language plpgsql security definer set search_path = public as $$
declare a record; fld jsonb;
begin
  new.received_at := now();
  select * into a from public.attendances where shift_id = new.shift_id;
  if a.id is null or a.user_id <> new.spg_id then raise exception 'Clock-in dulu sebelum mencatat KPI.'; end if;
  if new.logged_at < a.clock_in_at - interval '1 minute'
     or (a.clock_out_at is not null and not a.auto_closed and new.logged_at > a.clock_out_at)
     or new.logged_at > now() + interval '5 minutes' then
    raise exception 'KPI harus dicatat selama shift.';
  end if;
  select f into fld
    from public.shifts s join public.requests r on r.id = s.request_id
         join public.campaigns c on c.id = r.campaign_id,
         jsonb_array_elements(c.kpi_fields) f
   where s.id = new.shift_id and f->>'key' = new.field_key;
  if fld is null then raise exception 'Field KPI % tidak ada di campaign ini.', new.field_key; end if;
  if coalesce((fld->>'proof_required')::boolean, false) and coalesce(new.proof_path, '') = '' then
    raise exception 'Field KPI % wajib disertai foto bukti.', new.field_key;
  end if;
  return new;
end;
$$;
create trigger kpi_logs_server_checks before insert on public.kpi_logs
  for each row execute function public.kpi_logs_server_checks();

-- =========================================================
-- 5. Exceptions, replacements, validation
-- =========================================================
create table public.exceptions (
  id          bigint generated always as identity primary key,
  shift_id    text not null references public.shifts(id),
  type        text not null check (type in ('no_show','off_site','late','short_shift','late_sync','kpi_outlier','no_clock_out')),
  detail      text not null default '',
  detected_at timestamptz not null default now(),
  status      text not null default 'open' check (status in ('open','resolved','waived')),
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  note        text not null default '',
  unique (shift_id, type)
);
create index exceptions_open_idx on public.exceptions(status) where status = 'open';

create or replace function public.late_threshold_min() returns int language sql immutable as $$ select 15 $$;
create or replace function public.late_sync_after() returns interval language sql immutable as $$ select interval '12 hours' $$;

create or replace function public.raise_exception_row(p_shift text, p_type text, p_detail text) returns void
language sql security definer set search_path = public as $$
  insert into public.exceptions (shift_id, type, detail) values (p_shift, p_type, p_detail)
  on conflict (shift_id, type) do nothing
$$;

create or replace function public.attendances_flag_exceptions() returns trigger
language plpgsql security definer set search_path = public as $$
declare s record; worked interval; planned interval;
begin
  if tg_op = 'INSERT' then
    if not new.geo_valid then
      perform public.raise_exception_row(new.shift_id, 'off_site',
        case when new.mocked then 'Lokasi palsu terdeteksi' else 'Jarak ' || coalesce(new.distance_m::text, '?') || ' m dari venue' end);
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
create trigger attendances_flag_exceptions after insert or update of clock_out_at on public.attendances
  for each row execute function public.attendances_flag_exceptions();

create table public.replacements (
  id                text primary key,
  original_shift_id text not null unique references public.shifts(id),
  reason            text not null check (reason in ('no_show','resignation','underperform')),
  requested_at      timestamptz not null default now(),
  due_at            timestamptz not null,
  filled_shift_id   text references public.shifts(id),
  filled_at         timestamptz
);

create or replace function public.replacements_fill_due() returns trigger
language plpgsql security definer set search_path = public as $$
declare cap text;
begin
  new.requested_at := now();
  select c.capability into cap from public.shifts s join public.venues v on v.id = s.venue_id
    join public.cities c on c.id = v.city_id where s.id = new.original_shift_id;
  new.due_at := public.add_working_days(new.requested_at, case when cap = 'Strong' then 1 else 2 end);
  return new;
end;
$$;
create trigger replacements_fill_due before insert on public.replacements
  for each row execute function public.replacements_fill_due();

-- Run every 5 minutes by pg_cron (migration 0003): shifts 30 minutes past start with no clock-in.
create or replace function public.detect_no_shows() returns int
language plpgsql security definer set search_path = public as $$
declare s record; n int := 0;
begin
  for s in
    select sh.* from public.shifts sh
     where sh.status = 'planned'
       and sh.shift_date = public.wib(now())::date
       and public.wib(now()) > sh.shift_date + sh.planned_start + interval '30 minutes'
       and not exists (select 1 from public.attendances a where a.shift_id = sh.id)
  loop
    update public.shifts set status = 'no_show' where id = s.id;
    perform public.raise_exception_row(s.id, 'no_show', 'Tidak clock-in 30 menit setelah jam mulai');
    insert into public.replacements (id, original_shift_id, reason, due_at)
      values ('rp_' || s.id, s.id, 'no_show', now()) on conflict (original_shift_id) do nothing;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- PIC resolves or waives an exception, with a note.
create or replace function public.resolve_exception(p_id bigint, p_status text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_ops() then raise exception 'Hanya PIC yang bisa menyelesaikan exception.'; end if;
  if p_status not in ('resolved','waived') then raise exception 'Status tidak valid.'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'Catatan wajib diisi.'; end if;
  update public.exceptions set status = p_status, note = p_note, resolved_by = auth.uid(), resolved_at = now()
   where id = p_id and status = 'open';
end;
$$;

-- PIC validates a finished shift; only allowed when no exception is open.
create or replace function public.validate_shift(p_shift text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_ops() then raise exception 'Hanya PIC yang bisa memvalidasi shift.'; end if;
  if exists (select 1 from public.exceptions where shift_id = p_shift and status = 'open') then
    raise exception 'Masih ada exception terbuka di shift ini.';
  end if;
  update public.shifts set validated_at = now(), validated_by = auth.uid()
   where id = p_shift and status = 'done' and validated_at is null;
  if not found then raise exception 'Shift belum selesai atau sudah divalidasi.'; end if;
end;
$$;

-- Billable = done, validated, no open exception. Monthly billing reads this view.
create view public.billable_shifts with (security_invoker = true) as
  select s.id as shift_id, s.shift_date, s.spg_id, r.id as request_id, r.city_id, r.grade, r.package,
         r.shift_hours, s.overtime_hours
    from public.shifts s join public.requests r on r.id = s.request_id
   where s.status = 'done' and s.validated_at is not null
     and not exists (select 1 from public.exceptions e where e.shift_id = s.id and e.status = 'open');

-- =========================================================
-- 6. Daily report
-- =========================================================
create table public.daily_reports (
  report_date  date primary key,
  generated_at timestamptz not null default now(),
  totals       jsonb not null,
  published_at timestamptz,
  published_by uuid references public.profiles(id)
);

create or replace function public.build_daily_report(p_date date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t jsonb;
begin
  select jsonb_build_object(
    'planned',       count(*) filter (where s.status <> 'cancelled'),
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

create or replace function public.publish_daily_report(p_date date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_ops() then raise exception 'Hanya PIC yang bisa menerbitkan laporan.'; end if;
  perform public.build_daily_report(p_date);
  update public.daily_reports set published_at = now(), published_by = auth.uid()
   where report_date = p_date and published_at is null;
end;
$$;

-- =========================================================
-- 7. Live map (staff and Grab; never the caller's own row, never phone numbers)
-- =========================================================
create or replace function public.live_positions()
returns table (user_id uuid, name text, shift_id text, venue_id text, lat double precision,
               lng double precision, recorded_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.user_id, p.name, a.shift_id, s.venue_id,
         coalesce(rp.lat, a.clock_in_lat), coalesce(rp.lng, a.clock_in_lng),
         coalesce(rp.recorded_at, a.clock_in_at)
    from public.attendances a
    join public.profiles p on p.id = a.user_id
    join public.shifts s on s.id = a.shift_id
    left join lateral (select lat, lng, recorded_at from public.route_points r
                        where r.attendance_id = a.id order by recorded_at desc limit 1) rp on true
   where a.clock_out_at is null and a.clock_in_at > now() - interval '16 hours'
     and (public.can_monitor()
          or (public.current_role() = 'coordinator' and p.city_id = public.current_city_id()))
$$;

-- =========================================================
-- 8. Provisioning and audit
-- =========================================================
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, username, role, active)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
          coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
          'spg', false);                     -- never trust metadata for role/active
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.profiles_guard_update() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not coalesce(public.current_role() = 'super_admin', false) then
    if (new.role, new.active, new.username) is distinct from (old.role, old.active, old.username) then
      raise exception 'Role, status dan username hanya bisa diubah super admin.';
    end if;
    if auth.uid() = new.id and public.is_field()
       and (new.grade, new.contract_type, new.documents_ok, new.phone_ok, new.bpjs_registered, new.city_id)
           is distinct from
           (old.grade, old.contract_type, old.documents_ok, old.phone_ok, old.bpjs_registered, old.city_id) then
      raise exception 'Data ini diisi oleh back office.';
    end if;
  end if;
  return new;
end;
$$;
create trigger profiles_guard_update before update on public.profiles
  for each row execute function public.profiles_guard_update();

create table public.admin_audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor_id   uuid,
  table_name text not null,
  row_id     text not null,
  action     text not null,
  changes    jsonb not null
);

create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare o jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
        n jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
        diff jsonb;
begin
  select coalesce(jsonb_object_agg(k, jsonb_build_object('from', o->k, 'to', n->k)), '{}'::jsonb) into diff
    from (select jsonb_object_keys(o || n) k) keys where (o->k) is distinct from (n->k);
  insert into public.admin_audit_log (actor_id, table_name, row_id, action, changes)
  values (auth.uid(), tg_table_name, coalesce(n->>'id', o->>'id', n->>'report_date', o->>'report_date'), lower(tg_op), diff);
  return null;
end;
$$;
create trigger audit_profiles after update of role, active, grade, contract_type, city_id on public.profiles
  for each row execute function public.audit_row_change();
create trigger audit_requests after insert or update or delete on public.requests
  for each row execute function public.audit_row_change();
create trigger audit_shifts after update of status, spg_id, validated_at on public.shifts
  for each row execute function public.audit_row_change();
create trigger audit_exceptions after update of status on public.exceptions
  for each row execute function public.audit_row_change();
create trigger audit_venues after insert or update of lat, lng, radius_m on public.venues
  for each row execute function public.audit_row_change();
create trigger audit_daily_reports after update of published_at on public.daily_reports
  for each row execute function public.audit_row_change();

-- =========================================================
-- 9. Row-level security
-- =========================================================
alter table public.cities           enable row level security;
alter table public.profiles         enable row level security;
alter table public.profile_contacts enable row level security;
alter table public.venues           enable row level security;
alter table public.campaigns        enable row level security;
alter table public.requests         enable row level security;
alter table public.trainings        enable row level security;
alter table public.shifts           enable row level security;
alter table public.attendances      enable row level security;
alter table public.attendance_media enable row level security;
alter table public.route_points     enable row level security;
alter table public.kpi_logs         enable row level security;
alter table public.exceptions       enable row level security;
alter table public.replacements     enable row level security;
alter table public.daily_reports    enable row level security;
alter table public.admin_audit_log  enable row level security;

-- helper: is this shift the caller's own, or in the coordinator's city?
create or replace function public.shift_visible(p_shift text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_monitor()
      or exists (select 1 from public.shifts s where s.id = p_shift and s.spg_id = auth.uid())
      or (public.current_role() = 'coordinator' and exists (
            select 1 from public.shifts s join public.venues v on v.id = s.venue_id
             where s.id = p_shift and v.city_id = public.current_city_id()))
$$;

-- reference data: readable by every active user
create policy cities_read on public.cities for select using (public.current_role() is not null);
create policy cities_write on public.cities for all using (public.is_ops()) with check (public.is_ops());
create policy campaigns_read on public.campaigns for select using (public.current_role() is not null);
create policy campaigns_write on public.campaigns for all using (public.is_ops()) with check (public.is_ops());
create policy venues_read on public.venues for select using (public.current_role() is not null);
create policy venues_write on public.venues for all using (public.is_ops()) with check (public.is_ops());

-- profiles: self, staff, Grab (names/grades only — phones are elsewhere), coordinator's city
create policy profiles_read on public.profiles for select using (
  id = auth.uid() or public.can_monitor()
  or (public.current_role() = 'coordinator' and city_id = public.current_city_id()));
create policy profiles_update on public.profiles for update using (id = auth.uid() or public.is_staff())
  with check (id = auth.uid() or public.is_staff());

create policy contacts_read on public.profile_contacts for select using (user_id = auth.uid() or public.is_staff());
create policy contacts_write on public.profile_contacts for all using (user_id = auth.uid() or public.is_staff())
  with check (user_id = auth.uid() or public.is_staff());

-- requests: ops and Grab can submit; everyone who monitors reads
create policy requests_read on public.requests for select using (public.can_monitor());
create policy requests_insert on public.requests for insert
  with check (public.is_ops() or public.current_role() = 'grab_viewer');
create policy requests_update on public.requests for update using (public.is_ops()) with check (public.is_ops());

create policy trainings_read on public.trainings for select using (spg_id = auth.uid() or public.can_monitor());
create policy trainings_write on public.trainings for insert
  with check (public.is_staff() and recorded_by = auth.uid());

create policy shifts_read on public.shifts for select using (public.shift_visible(id));
create policy shifts_write on public.shifts for insert with check (public.is_ops());
create policy shifts_update on public.shifts for update using (public.is_ops()) with check (public.is_ops());

create policy att_read on public.attendances for select using (public.shift_visible(shift_id));
create policy att_insert on public.attendances for insert with check (user_id = auth.uid() and public.is_field());
create policy att_update on public.attendances for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy media_read on public.attendance_media for select using (
  public.is_staff() or exists (select 1 from public.attendances a where a.id = attendance_id and a.user_id = auth.uid()));
create policy media_insert on public.attendance_media for insert with check (
  exists (select 1 from public.attendances a where a.id = attendance_id and a.user_id = auth.uid()));
create policy media_update on public.attendance_media for update using (
  exists (select 1 from public.attendances a where a.id = attendance_id and a.user_id = auth.uid() and a.clock_out_at is null))
  with check (exists (select 1 from public.attendances a where a.id = attendance_id and a.user_id = auth.uid()));

-- raw GPS trail: owner and SPC staff only (Grab gets the live map, not history)
create policy route_read on public.route_points for select using (user_id = auth.uid() or public.is_staff());
create policy route_insert on public.route_points for insert with check (
  user_id = auth.uid() and exists (select 1 from public.attendances a where a.id = attendance_id and a.user_id = auth.uid()));

create policy kpi_read on public.kpi_logs for select using (public.shift_visible(shift_id));
create policy kpi_insert on public.kpi_logs for insert with check (spg_id = auth.uid() and public.is_field());

create policy exc_read on public.exceptions for select using (public.shift_visible(shift_id));
create policy repl_read on public.replacements for select using (public.can_monitor());
create policy repl_update on public.replacements for update using (public.is_ops()) with check (public.is_ops());

create policy reports_read on public.daily_reports for select using (
  public.is_staff() or (public.current_role() = 'grab_viewer' and published_at is not null));

create policy audit_read on public.admin_audit_log for select using (public.current_role() in ('super_admin','pic'));

-- RPCs callable by signed-in users (each checks the caller's role itself)
-- Internal jobs: never callable through the API. Supabase grants anon/authenticated execute on new
-- functions by default, so revoking from public alone is not enough.
revoke execute on function public.detect_no_shows() from public, anon, authenticated;
revoke execute on function public.build_daily_report(date) from public, anon, authenticated;
revoke execute on function public.raise_exception_row(text, text, text) from public, anon, authenticated;
