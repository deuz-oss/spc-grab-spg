-- Gap check 11 Oct 2026 (docs/audit/FINAL_VERIFICATION.md): staging compared with the repo, object by object.
-- Two helper functions were executable by signed-out callers (anon): retention_months() on staging (it was
-- created after 0005 there, so 0005's revoke never covered it) and is_api_caller() everywhere (0009). Neither
-- leaks anything — one returns 12, the other compares current_user — but nothing in this API is for anon
-- (0005), so they follow the same rule. retention_months() also gets the fixed search_path staging already has.

revoke execute on function public.retention_months() from public, anon;
revoke execute on function public.is_api_caller()   from public, anon;
alter function public.retention_months() set search_path = public;
