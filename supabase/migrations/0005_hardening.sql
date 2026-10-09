-- Hardening from the Supabase security advisor on staging (9 Oct 2026).
-- 1. Nothing in the API is for signed-out callers: anon executes no function in public.
--    (Login goes through Supabase Auth, not an RPC.) Future functions inherit the same default.
-- 2. Trigger functions are never called directly; triggers do not need the caller's EXECUTE.
-- 3. Every function gets a fixed search_path.

revoke execute on all functions in schema public from public, anon;
alter default privileges in schema public revoke execute on functions from public, anon;

revoke execute on function public.attendances_flag_exceptions() from authenticated;
revoke execute on function public.attendances_server_checks()   from authenticated;
revoke execute on function public.attendances_guard_update()    from authenticated;
revoke execute on function public.audit_row_change()            from authenticated;
revoke execute on function public.handle_new_auth_user()        from authenticated;
revoke execute on function public.kpi_logs_server_checks()      from authenticated;
revoke execute on function public.profiles_guard_update()       from authenticated;
revoke execute on function public.replacements_fill_due()       from authenticated;
revoke execute on function public.requests_server_fill()        from authenticated;
revoke execute on function public.shifts_server_checks()        from authenticated;
do $$ begin
  if to_regprocedure('public.client_errors_rate_limit()') is not null then
    revoke execute on function public.client_errors_rate_limit() from authenticated;
  end if;
end $$;

alter function public.add_working_days(timestamptz, integer)                 set search_path = public;
alter function public.attendances_guard_update()                             set search_path = public;
alter function public.can_monitor()                                          set search_path = public;
alter function public.grade_rank(text)                                       set search_path = public;
alter function public.haversine_m(double precision, double precision, double precision, double precision) set search_path = public;
alter function public.is_field()                                             set search_path = public;
alter function public.is_ops()                                               set search_path = public;
alter function public.is_staff()                                             set search_path = public;
alter function public.late_sync_after()                                      set search_path = public;
alter function public.late_threshold_min()                                   set search_path = public;
alter function public.max_offline_age()                                      set search_path = public;
alter function public.profiles_guard_update()                                set search_path = public;
alter function public.wib(timestamptz)                                       set search_path = public;
