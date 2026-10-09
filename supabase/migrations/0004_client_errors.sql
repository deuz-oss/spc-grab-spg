-- Client crash log (from spc-nc-workforce 0018): the app's ErrorBoundary and reportError()
-- write here when Sentry is not configured. Super admin reads; 50 reports per user per hour.
create table if not exists public.client_errors (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  user_id     uuid default auth.uid() references public.profiles(id) on delete set null,
  message     text not null check (char_length(message) <= 2000),
  stack       text check (char_length(stack) <= 8000),
  context     text check (char_length(context) <= 200),
  platform    text check (char_length(platform) <= 40),
  app_version text check (char_length(app_version) <= 40)
);
create index if not exists client_errors_at_idx on public.client_errors (at desc);

alter table public.client_errors enable row level security;
create policy client_errors_insert on public.client_errors for insert with check (user_id = auth.uid());
create policy client_errors_select on public.client_errors for select using (public.current_role() = 'super_admin');

create or replace function public.client_errors_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.at := now();
  if (select count(*) from public.client_errors
       where user_id = new.user_id and at > now() - interval '1 hour') >= 50 then
    return null;
  end if;
  return new;
end;
$$;
create trigger client_errors_rate_limit_trg before insert on public.client_errors
  for each row execute function public.client_errors_rate_limit();
