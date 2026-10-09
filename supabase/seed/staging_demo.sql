-- Staging demo data (SPC Grab SPG). Demo accounts use username@internal.spc.
-- Passwords are not stored in the repo; replace <PASSWORD_x> before running.
begin;
insert into public.cities (id, name, province, umk, capability) values
  ('kota-surabaya','Kota Surabaya','Jawa Timur',5288796,'Strong'),
  ('jakarta','Jakarta','DKI Jakarta',5729876,'Weak')
on conflict (id) do nothing;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values ('00000000-0000-0000-0000-000000000000', 'de000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'demo.admin@internal.spc',
  extensions.crypt('<PASSWORD_demo.admin>', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
  '{"username": "demo.admin", "name": "Demo Super Admin"}', now(), now(), '', '', '', '')
on conflict (id) do nothing;
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values ('de000000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000001', '{"sub": "de000000-0000-0000-0000-000000000001", "email": "demo.admin@internal.spc", "email_verified": true}', 'email', now(), now(), now())
on conflict do nothing;
update public.profiles set role = 'super_admin', active = true, city_id = null, grade = null, contract_type = null,
  documents_ok = false, phone_ok = false,
  bpjs_registered = false where id = 'de000000-0000-0000-0000-000000000001';
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values ('00000000-0000-0000-0000-000000000000', 'de000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'demo.pic@internal.spc',
  extensions.crypt('<PASSWORD_demo.pic>', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
  '{"username": "demo.pic", "name": "Demo PIC SPC"}', now(), now(), '', '', '', '')
on conflict (id) do nothing;
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values ('de000000-0000-0000-0000-000000000002', 'de000000-0000-0000-0000-000000000002', '{"sub": "de000000-0000-0000-0000-000000000002", "email": "demo.pic@internal.spc", "email_verified": true}', 'email', now(), now(), now())
on conflict do nothing;
update public.profiles set role = 'pic', active = true, city_id = null, grade = null, contract_type = null,
  documents_ok = false, phone_ok = false,
  bpjs_registered = false where id = 'de000000-0000-0000-0000-000000000002';
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values ('00000000-0000-0000-0000-000000000000', 'de000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'demo.bo@internal.spc',
  extensions.crypt('<PASSWORD_demo.bo>', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
  '{"username": "demo.bo", "name": "Demo Back Office"}', now(), now(), '', '', '', '')
on conflict (id) do nothing;
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values ('de000000-0000-0000-0000-000000000003', 'de000000-0000-0000-0000-000000000003', '{"sub": "de000000-0000-0000-0000-000000000003", "email": "demo.bo@internal.spc", "email_verified": true}', 'email', now(), now(), now())
on conflict do nothing;
update public.profiles set role = 'back_office', active = true, city_id = null, grade = null, contract_type = null,
  documents_ok = false, phone_ok = false,
  bpjs_registered = false where id = 'de000000-0000-0000-0000-000000000003';
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values ('00000000-0000-0000-0000-000000000000', 'de000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'demo.coord@internal.spc',
  extensions.crypt('<PASSWORD_demo.coord>', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
  '{"username": "demo.coord", "name": "Demo Koordinator Surabaya"}', now(), now(), '', '', '', '')
on conflict (id) do nothing;
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values ('de000000-0000-0000-0000-000000000004', 'de000000-0000-0000-0000-000000000004', '{"sub": "de000000-0000-0000-0000-000000000004", "email": "demo.coord@internal.spc", "email_verified": true}', 'email', now(), now(), now())
on conflict do nothing;
update public.profiles set role = 'coordinator', active = true, city_id = 'kota-surabaya', grade = 'A', contract_type = 'pkwt',
  documents_ok = true, phone_ok = true,
  bpjs_registered = true where id = 'de000000-0000-0000-0000-000000000004';
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values ('00000000-0000-0000-0000-000000000000', 'de000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'demo.spg@internal.spc',
  extensions.crypt('<PASSWORD_demo.spg>', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
  '{"username": "demo.spg", "name": "Demo SPG Surabaya"}', now(), now(), '', '', '', '')
on conflict (id) do nothing;
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values ('de000000-0000-0000-0000-000000000005', 'de000000-0000-0000-0000-000000000005', '{"sub": "de000000-0000-0000-0000-000000000005", "email": "demo.spg@internal.spc", "email_verified": true}', 'email', now(), now(), now())
on conflict do nothing;
update public.profiles set role = 'spg', active = true, city_id = 'kota-surabaya', grade = 'B', contract_type = 'daily_worker',
  documents_ok = true, phone_ok = true,
  bpjs_registered = true where id = 'de000000-0000-0000-0000-000000000005';
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values ('00000000-0000-0000-0000-000000000000', 'de000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'demo.grab@internal.spc',
  extensions.crypt('<PASSWORD_demo.grab>', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
  '{"username": "demo.grab", "name": "Demo Grab Viewer"}', now(), now(), '', '', '', '')
on conflict (id) do nothing;
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values ('de000000-0000-0000-0000-000000000006', 'de000000-0000-0000-0000-000000000006', '{"sub": "de000000-0000-0000-0000-000000000006", "email": "demo.grab@internal.spc", "email_verified": true}', 'email', now(), now(), now())
on conflict do nothing;
update public.profiles set role = 'grab_viewer', active = true, city_id = null, grade = null, contract_type = null,
  documents_ok = false, phone_ok = false,
  bpjs_registered = false where id = 'de000000-0000-0000-0000-000000000006';
insert into public.venues (id, city_id, name, address, lat, lng, radius_m, created_by) values
  ('v-demo-tp','kota-surabaya','Tunjungan Plaza (demo)','Jl. Basuki Rahmat 8-12, Surabaya',-7.2625,112.7389,150,'de000000-0000-0000-0000-000000000002'),
  ('v-demo-gi','jakarta','Grand Indonesia (demo)','Jl. M.H. Thamrin 1, Jakarta',-6.1951,106.8209,150,'de000000-0000-0000-0000-000000000002')
on conflict (id) do nothing;
insert into public.campaigns (id, name, type, kpi_fields, starts_on) values
  ('c-demo-food','Demo — GrabFood new user','user',
   '[{"key":"downloads","label":"App downloads","unit":"count","proof_required":true},
     {"key":"contacts","label":"Contacts reached","unit":"count","proof_required":false}]', (now() at time zone 'Asia/Jakarta')::date)
on conflict (id) do nothing;
insert into public.trainings (id, spg_id, campaign_id, score, recorded_by) values
  ('t-demo-spg','de000000-0000-0000-0000-000000000005','c-demo-food',85,'de000000-0000-0000-0000-000000000002'),
  ('t-demo-coord','de000000-0000-0000-0000-000000000004','c-demo-food',92,'de000000-0000-0000-0000-000000000002')
on conflict do nothing;
insert into public.requests (id, campaign_id, city_id, venue_id, grade, headcount, start_date, end_date, shift_hours, package, notes)
values ('r-demo-1','c-demo-food','kota-surabaya','v-demo-tp','B',2,
        (now() at time zone 'Asia/Jakarta')::date, (now() at time zone 'Asia/Jakarta')::date + 13, 8, 'daily', 'Demo request')
on conflict (id) do nothing;
insert into public.shifts (id, request_id, venue_id, spg_id, shift_date, planned_start, planned_end) values
  ('s-demo-spg-d0','r-demo-1','v-demo-tp','de000000-0000-0000-0000-000000000005',(now() at time zone 'Asia/Jakarta')::date,'15:00','23:00'),
  ('s-demo-spg-d1','r-demo-1','v-demo-tp','de000000-0000-0000-0000-000000000005',(now() at time zone 'Asia/Jakarta')::date + 1,'09:00','17:00'),
  ('s-demo-coord-d1','r-demo-1','v-demo-tp','de000000-0000-0000-0000-000000000004',(now() at time zone 'Asia/Jakarta')::date + 1,'09:00','17:00')
on conflict (id) do nothing;
commit;
