-- KPI outlier (spec R11, data model: "outlier vs 7-day median flagged").
-- When a KPI value lands, compare that shift's total for the field with the per-shift totals of the
-- same campaign and field over the 7 days before it. A total of at least 3x the median, with at least
-- 5 earlier shifts to compare against and a median above zero, opens a kpi_outlier exception for the
-- PIC. Only high values are flagged: a low day is coaching, an implausibly high one is what invoices
-- and fraud checks care about. The exception blocks billing until the PIC resolves or waives it.

create or replace function public.kpi_outlier_factor() returns numeric
language sql immutable set search_path = public as $$ select 3::numeric $$;
create or replace function public.kpi_outlier_min_samples() returns int
language sql immutable set search_path = public as $$ select 5 $$;
-- Postgres grants EXECUTE on every new function to PUBLIC; per-schema default privileges (0005) cannot
-- take that back, which is how retention_months() slipped through (0011). Revoke explicitly.
revoke execute on function public.kpi_outlier_factor() from public, anon;
revoke execute on function public.kpi_outlier_min_samples() from public, anon;

create or replace function public.kpi_logs_flag_outlier() returns trigger
language plpgsql security definer set search_path = public as $$
declare camp text; total numeric; med numeric; n int;
begin
  select r.campaign_id into camp
    from public.shifts s join public.requests r on r.id = s.request_id where s.id = new.shift_id;

  select coalesce(sum(value), 0) into total
    from public.kpi_logs where shift_id = new.shift_id and field_key = new.field_key;

  select percentile_cont(0.5) within group (order by t.v), count(*)
    into med, n
    from (select k.shift_id, sum(k.value) v
            from public.kpi_logs k
            join public.shifts s on s.id = k.shift_id
            join public.requests r on r.id = s.request_id
           where r.campaign_id = camp and k.field_key = new.field_key
             and k.shift_id <> new.shift_id
             and k.logged_at >= new.logged_at - interval '7 days' and k.logged_at < new.logged_at
           group by k.shift_id) t;

  if n >= public.kpi_outlier_min_samples() and med > 0 and total >= public.kpi_outlier_factor() * med then
    perform public.raise_exception_row(new.shift_id, 'kpi_outlier',
      format('%s = %s, median 7 hari %s (%s shift)', new.field_key, total, round(med, 1), n));
  end if;
  return null;
end;
$$;
revoke execute on function public.kpi_logs_flag_outlier() from public, anon, authenticated;
create trigger kpi_logs_flag_outlier after insert on public.kpi_logs
  for each row execute function public.kpi_logs_flag_outlier();
