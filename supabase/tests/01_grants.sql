-- Mimic Supabase's default privileges BEFORE the migrations run: every new table, sequence and
-- function in public is granted to anon, authenticated and service_role. RLS and the migrations'
-- own revokes then do the scoping, exactly as on a real project.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
