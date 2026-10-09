-- Supabase grants table/function access to these roles by default; RLS does the scoping.
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to authenticated, service_role;
grant all on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;
-- re-apply the migration's intent: internal jobs are not callable by end users
revoke execute on function public.detect_no_shows() from authenticated;
revoke execute on function public.build_daily_report(date) from authenticated;
revoke execute on function public.raise_exception_row(text, text, text) from authenticated;
