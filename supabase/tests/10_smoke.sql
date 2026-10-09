-- Smoke test: business rules and RLS per role, on plain Postgres with the Supabase stub.
-- Every check raises on failure; the run stops at the first failed check (ON_ERROR_STOP).
\set ON_ERROR_STOP on
set client_min_messages = notice;

create schema tests;
grant usage on schema tests to authenticated;

create function tests.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p::text, ''), false)
$$;
create function tests.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'pass: %', label;
end $$;
create function tests.fails(stmt text, expect text, label text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlerrm ilike '%' || expect || '%' then raise notice 'pass: %', label; return; end if;
    raise exception 'FAIL: % — wrong error: %', label, sqlerrm;
  end;
  raise exception 'FAIL: % — statement succeeded', label;
end $$;
create function tests.count_rows(q text) returns bigint language plpgsql as $$
declare n bigint; begin execute 'select count(*) from (' || q || ') x' into n; return n; end $$;
grant execute on all functions in schema tests to authenticated;

-- ---------------------------------------------------------------- fixtures (service context)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@internal.spc', '{"username":"admin"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'pic@internal.spc',   '{"username":"pic"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'bo@internal.spc',    '{"username":"bo"}'),
  ('00000000-0000-0000-0000-0000000000d1', 'coord@internal.spc', '{"username":"coord"}'),
  ('00000000-0000-0000-0000-0000000000e1', 'spg1@internal.spc',  '{"username":"spg1"}'),
  ('00000000-0000-0000-0000-0000000000e2', 'spg2@internal.spc',  '{"username":"spg2"}'),
  ('00000000-0000-0000-0000-0000000000e3', 'spg3@internal.spc',  '{"username":"spg3"}'),
  ('00000000-0000-0000-0000-0000000000f1', 'grab@internal.spc',  '{"username":"grab"}'),
  ('00000000-0000-0000-0000-0000000000ff', 'hacker@internal.spc','{"username":"hacker","role":"super_admin"}');

select tests.ok((select count(*) from public.profiles where active) = 0, 'new auth users start inactive');
select tests.ok((select role from public.profiles where username = 'hacker') = 'spg', 'signup metadata cannot grant a role');

insert into public.cities (id, name, province, umk, capability) values
  ('kota-surabaya', 'Kota Surabaya', 'Jawa Timur', 5288796, 'Strong'),
  ('jakarta',       'Jakarta',       'DKI Jakarta', 5729876, 'Weak');

update public.profiles set active = true, role = 'super_admin' where username = 'admin';
update public.profiles set active = true, role = 'pic' where username = 'pic';
update public.profiles set active = true, role = 'back_office' where username = 'bo';
update public.profiles set active = true, role = 'coordinator', city_id = 'kota-surabaya' where username = 'coord';
update public.profiles set active = true, role = 'spg', grade = 'B', contract_type = 'daily_worker', city_id = 'kota-surabaya' where username = 'spg1';
update public.profiles set active = true, role = 'spg', grade = 'C', contract_type = 'daily_worker', city_id = 'jakarta' where username = 'spg2';
update public.profiles set active = true, role = 'spg', grade = 'A', contract_type = 'daily_worker', city_id = 'kota-surabaya' where username = 'spg3';
update public.profiles set active = true, role = 'grab_viewer' where username = 'grab';
insert into public.profile_contacts values ('00000000-0000-0000-0000-0000000000e1', '081200000001');

insert into public.venues (id, city_id, name, lat, lng, radius_m) values
  ('v_tp', 'kota-surabaya', 'Tunjungan Plaza', -7.2625, 112.7389, 150),
  ('v_gi', 'jakarta', 'Grand Indonesia', -6.1951, 106.8209, 150);
insert into public.campaigns (id, name, type, kpi_fields, starts_on) values
  ('c_food', 'GrabFood push', 'user',
   '[{"key":"downloads","label":"Downloads","unit":"count","proof_required":true},
     {"key":"contacts","label":"Contacts","unit":"count","proof_required":false}]', current_date - 30);

-- ---------------------------------------------------------------- PIC: request, training, shifts
select tests.as_user('00000000-0000-0000-0000-0000000000b1');
set role authenticated;

insert into public.requests (id, campaign_id, city_id, venue_id, grade, headcount, start_date, end_date, shift_hours, package)
values ('r1', 'c_food', 'kota-surabaya', 'v_tp', 'B', 2,
        public.wib(now())::date, public.wib(now())::date + 7, 10, 'daily');
select tests.ok((select sla_hiring_due = public.add_working_days(submitted_at, 5) from public.requests where id = 'r1'),
                'Strong city: SLA hiring due in 5 working days');
select tests.fails($$insert into public.requests (id, campaign_id, city_id, venue_id, grade, headcount, start_date, end_date, shift_hours, package)
                     values ('rx', 'c_food', 'jakarta', 'v_tp', 'B', 1, current_date, current_date, 8, 'daily')$$,
                   'tidak berada di kota', 'venue must belong to the request city');

-- shift timing relative to now so lateness and no-show are deterministic
create temp table t_clock as
  select public.wib(now())::date as d,
         (public.wib(now()) - interval '20 minutes')::time as start_late,
         (public.wib(now()) - interval '40 minutes')::time as start_noshow;

select tests.fails($$insert into public.shifts (id, request_id, venue_id, spg_id, shift_date, planned_start, planned_end)
                     select 's_low', 'r1', 'v_tp', '00000000-0000-0000-0000-0000000000e2', d, start_late, '23:59' from t_clock$$,
                   'di bawah grade', 'grade C SPG cannot fill a grade B request');
select tests.fails($$insert into public.shifts (id, request_id, venue_id, spg_id, shift_date, planned_start, planned_end)
                     select 's_untrained', 'r1', 'v_tp', '00000000-0000-0000-0000-0000000000e1', d, start_late, '23:59' from t_clock$$,
                   'belum lulus training', 'untrained SPG cannot be scheduled');
reset role;

select tests.as_user('00000000-0000-0000-0000-0000000000c1');
set role authenticated;
insert into public.trainings (id, spg_id, campaign_id, score, recorded_by) values
  ('tr1', '00000000-0000-0000-0000-0000000000e1', 'c_food', 85, '00000000-0000-0000-0000-0000000000c1'),
  ('tr3', '00000000-0000-0000-0000-0000000000e3', 'c_food', 90, '00000000-0000-0000-0000-0000000000c1');
reset role;

select tests.as_user('00000000-0000-0000-0000-0000000000b1');
set role authenticated;
insert into public.shifts (id, request_id, venue_id, spg_id, shift_date, planned_start, planned_end)
  select 's1', 'r1', 'v_tp', '00000000-0000-0000-0000-0000000000e1', d, start_late, '23:59' from t_clock;
insert into public.shifts (id, request_id, venue_id, spg_id, shift_date, planned_start, planned_end)
  select 's3', 'r1', 'v_tp', '00000000-0000-0000-0000-0000000000e3', d, start_noshow, '23:59' from t_clock;
select tests.ok((select overtime_hours from public.shifts where id = 's1') = 2, '10-hour shift = 2 overtime hours');
reset role;

-- ---------------------------------------------------------------- SPG: clock-in, KPI
select tests.as_user('00000000-0000-0000-0000-0000000000e1');
set role authenticated;
-- ~300 m north of the venue pin: outside the 150 m radius
insert into public.attendances (id, shift_id, user_id, clock_in_at, clock_in_lat, clock_in_lng, geo_valid, late_min)
values ('a1', 's1', '00000000-0000-0000-0000-0000000000e1', now(), -7.2598, 112.7389, true, 0);
insert into public.attendance_media values ('a1', 'selfies/a1-in.jpg', null);
select tests.ok((select not geo_valid and distance_m between 250 and 350 from public.attendances where id = 'a1'),
                'server recomputes geofence; client geo_valid=true is ignored');
select tests.ok((select late_min between 19 and 21 from public.attendances where id = 'a1'), 'server computes lateness');
select tests.ok(tests.count_rows($$select 1 from public.exceptions where shift_id = 's1' and type in ('off_site','late')$$) = 2,
                'off-site and late exceptions raised automatically');
select tests.fails($$update public.attendances set clock_in_lat = -7.2625 where id = 'a1'$$,
                   'tidak bisa diubah', 'clock-in location is immutable');
select tests.fails($$insert into public.kpi_logs (id, shift_id, spg_id, field_key, value, logged_at)
                     values ('k0', 's1', '00000000-0000-0000-0000-0000000000e1', 'downloads', 12, now())$$,
                   'wajib disertai foto', 'proof required for downloads');
select tests.fails($$insert into public.kpi_logs (id, shift_id, spg_id, field_key, value, logged_at)
                     values ('k9', 's1', '00000000-0000-0000-0000-0000000000e1', 'likes', 3, now())$$,
                   'tidak ada di campaign', 'unknown KPI field rejected');
insert into public.kpi_logs (id, shift_id, spg_id, field_key, value, proof_path, logged_at)
  values ('k1', 's1', '00000000-0000-0000-0000-0000000000e1', 'downloads', 12, 'proof/k1.jpg', now());
insert into public.kpi_logs (id, shift_id, spg_id, field_key, value, logged_at)
  values ('k2', 's1', '00000000-0000-0000-0000-0000000000e1', 'contacts', 40, now());
select tests.fails($$update public.profiles set role = 'super_admin' where id = '00000000-0000-0000-0000-0000000000e1'$$,
                   'super admin', 'SPG cannot change own role');
select tests.fails($$update public.profiles set grade = 'A' where id = '00000000-0000-0000-0000-0000000000e1'$$,
                   'back office', 'SPG cannot change own grade');
select tests.fails($$select public.resolve_exception((select id from public.exceptions limit 1), 'waived', 'x')$$,
                   'Hanya PIC', 'SPG cannot resolve exceptions');
reset role;

-- ---------------------------------------------------------------- visibility per role
select tests.as_user('00000000-0000-0000-0000-0000000000e2');
set role authenticated;
select tests.ok(tests.count_rows('select 1 from public.attendances') = 0, 'SPG cannot see another SPG''s attendance');
select tests.ok(tests.count_rows('select 1 from public.kpi_logs') = 0, 'SPG cannot see another SPG''s KPI');
reset role;

select tests.as_user('00000000-0000-0000-0000-0000000000d1');
set role authenticated;
select tests.ok(tests.count_rows('select 1 from public.attendances') = 1, 'coordinator sees attendance in own city');
select tests.ok(tests.count_rows('select 1 from public.attendance_media') = 0, 'coordinator cannot see selfies');
reset role;

select tests.as_user('00000000-0000-0000-0000-0000000000f1');
set role authenticated;
select tests.ok(tests.count_rows('select 1 from public.attendances') = 1, 'Grab sees attendance');
select tests.ok(tests.count_rows('select 1 from public.kpi_logs') = 2, 'Grab sees KPI');
select tests.ok(tests.count_rows('select 1 from public.attendance_media') = 0, 'Grab cannot see selfies');
select tests.ok(tests.count_rows('select 1 from public.profile_contacts') = 0, 'Grab cannot see SPG phone numbers');
select tests.ok(tests.count_rows('select 1 from public.route_points') = 0, 'Grab cannot read GPS history');
select tests.ok(tests.count_rows('select 1 from public.live_positions()') = 1, 'Grab sees the live map');
select tests.fails($$insert into public.shifts (id, request_id, venue_id, spg_id, shift_date, planned_start, planned_end)
                     values ('s_g', 'r1', 'v_tp', '00000000-0000-0000-0000-0000000000e3', current_date, '08:00', '16:00')$$,
                   'row-level security', 'Grab cannot schedule shifts');
insert into public.requests (id, campaign_id, city_id, venue_id, grade, headcount, start_date, end_date, shift_hours, package)
values ('r_grab', 'c_food', 'jakarta', 'v_gi', 'C', 1, current_date + 3, current_date + 3, 8, 'daily');
select tests.ok((select submitted_by = '00000000-0000-0000-0000-0000000000f1' and sla_hiring_due = public.add_working_days(submitted_at, 10)
                   from public.requests where id = 'r_grab'), 'Grab can submit a request; Weak city SLA 10 working days');
reset role;

select tests.as_user('00000000-0000-0000-0000-0000000000ff');
set role authenticated;
select tests.ok(tests.count_rows('select 1 from public.cities') = 0, 'inactive account reads nothing');
reset role;

-- ---------------------------------------------------------------- no-show job (service context)
select tests.as_user(null);
select tests.ok(public.detect_no_shows() = 1, 'no-show detected 30 minutes after start');
select tests.ok((select status from public.shifts where id = 's3') = 'no_show', 'no-show shift marked');
select tests.ok((select due_at = public.add_working_days(requested_at, 1) from public.replacements where original_shift_id = 's3'),
                'Strong city replacement due in 1 working day');

-- ---------------------------------------------------------------- clock-out, validation, billing
select tests.as_user('00000000-0000-0000-0000-0000000000b1');
set role authenticated;
select tests.fails($$select public.validate_shift('s1')$$, 'exception terbuka', 'cannot validate with open exceptions');
reset role;

select tests.as_user('00000000-0000-0000-0000-0000000000e1');
set role authenticated;
update public.attendances set clock_out_at = now(), clock_out_lat = -7.2625, clock_out_lng = 112.7389 where id = 'a1';
select tests.fails($$update public.attendances set clock_out_at = now() where id = 'a1'$$, 'sudah tercatat', 'clock-out only once');
reset role;
select tests.ok((select status from public.shifts where id = 's1') = 'done', 'clock-out marks the shift done');
select tests.ok(tests.count_rows($$select 1 from public.exceptions where shift_id = 's1' and type = 'short_shift'$$) = 1,
                'short shift flagged');

select tests.as_user('00000000-0000-0000-0000-0000000000b1');
set role authenticated;
select tests.fails($$select public.resolve_exception((select id from public.exceptions where shift_id='s1' and type='late'), 'waived', ' ')$$,
                   'Catatan wajib', 'resolving needs a note');
select public.resolve_exception(id, 'resolved', 'Checked by phone with SPG; venue entrance moved')
  from public.exceptions where shift_id = 's1' and status = 'open';
select public.validate_shift('s1');
select tests.ok(tests.count_rows($$select 1 from public.billable_shifts where shift_id = 's1'$$) = 1, 'validated shift is billable');
select tests.ok(tests.count_rows($$select 1 from public.billable_shifts where shift_id = 's3'$$) = 0, 'no-show shift is not billable');
select tests.ok(tests.count_rows($$select 1 from public.admin_audit_log where table_name = 'exceptions'$$) >= 3,
                'exception resolutions are audited');
reset role;

-- ---------------------------------------------------------------- daily report
select tests.as_user(null);
select public.build_daily_report(public.wib(now())::date);
select tests.as_user('00000000-0000-0000-0000-0000000000f1');
set role authenticated;
select tests.ok(tests.count_rows('select 1 from public.daily_reports') = 0, 'Grab cannot read an unpublished report');
select tests.fails($$select public.publish_daily_report(current_date)$$, 'Hanya PIC', 'Grab cannot publish');
reset role;
select tests.as_user('00000000-0000-0000-0000-0000000000b1');
set role authenticated;
select public.publish_daily_report(public.wib(now())::date);
reset role;
select tests.as_user('00000000-0000-0000-0000-0000000000f1');
set role authenticated;
select tests.ok((select (totals->'kpi'->>'downloads')::int = 12 and (totals->>'no_show')::int = 1 from public.daily_reports),
                'published report: KPI totals and no-shows visible to Grab');
reset role;

-- ---------------------------------------------------------------- auto-close and retention (service context)
select tests.as_user(null);
insert into public.requests (id, campaign_id, city_id, venue_id, grade, headcount, start_date, end_date, shift_hours, package)
values ('r_old', 'c_food', 'kota-surabaya', 'v_tp', 'C', 1, current_date - 3, current_date + 3, 8, 'daily');
insert into public.shifts (id, request_id, venue_id, spg_id, shift_date, planned_start, planned_end)
  select 's_old', 'r_old', 'v_tp', '00000000-0000-0000-0000-0000000000e3',
         public.wib(now() - interval '17 hours')::date,
         (public.wib(now() - interval '17 hours') - interval '1 minute')::time, '23:59';
insert into public.attendances (id, shift_id, user_id, clock_in_at, clock_in_lat, clock_in_lng)
  values ('a_old', 's_old', '00000000-0000-0000-0000-0000000000e3', now() - interval '17 hours', -7.2625, 112.7389);
insert into public.attendance_media values ('a_old', '00000000-0000-0000-0000-0000000000e3/a_old-in.jpg', null);
select tests.ok(public.auto_close_attendances() = 1, 'attendance open > 16 h is auto-closed');
select tests.ok(tests.count_rows($$select 1 from public.exceptions where shift_id = 's_old' and type = 'no_clock_out'$$) = 1,
                'auto-close raises a no-clock-out exception');
update public.attendances set clock_in_at = now() - interval '13 months' where id = 'a_old';
select tests.ok((public.purge_expired_personal_data()->>'selfie_rows')::int = 1, 'selfie reference purged after 12 months');
select tests.ok(tests.count_rows($$select 1 from public.media_purge_queue where path like '%a_old-in.jpg'$$) = 1,
                'purged selfie queued for storage deletion');
select tests.ok(tests.count_rows($$select 1 from public.attendances where id = 'a_old'$$) = 1, 'attendance row kept for invoices');

\echo 'ALL SMOKE CHECKS PASSED'
