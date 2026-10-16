# SPC Grab SPG

Field platform for PT Sinergi Performa Cipta's SPG/SPB programme for PT Grab Teknologi Indonesia
(RFP National SPG Services 2026). Spec: "Spec — SPC Grab Field Platform", approved 9 Oct 2026.

Scaffolded from `deuz-oss/spc-nc-workforce` (Expo + Supabase), which was itself scaffolded from
`deuz-oss/spc-field-force`. Its plumbing is reused; its nutrition-consultant domain is replaced by Grab's
loop: **request → schedule → geotag clock-in → KPI → server checks → PIC validation → daily report → billing**.

## Status

| Phase (spec) | Dates | State |
|---|---|---|
| Spec approval | 10–12 Oct | ✅ approved 9 Oct |
| Foundation: backend | 13–17 Oct | ✅ schema, RLS, server rules, jobs — 88 smoke checks pass on Postgres 16 |
| Foundation: app scaffold | 13–17 Oct | ✅ login, SPG today (selfie clock-in, KPI, clock-out, offline queue), PIC/Grab today (exception queue, validation), profile — tsc, lint, 56 unit tests, web bundle green |
| Supabase staging (`irsgynzhdlwnbvcjynqf`, Singapore, free plan) | 9–11 Oct | ✅ migrations `0001`–`0013` applied (the retention purge was pasted in the SQL Editor). All 5 cron jobs live (no-shows, auto-close, daily report, request status, retention). Schema checked object by object against the repo on 11 Oct: identical apart from comments. Edge function `admin-users` v2. Demo data from `supabase/seed/staging_demo.sql` (6 accounts, one per role) |
| Foundation: Android dev build on a real phone | 13–17 Oct | 🟡 EAS project `@deuz-osss-team/spc-grab-spg` linked 15 Oct. First preview APK (versionCode 1) on a Galaxy S24 Ultra, Android 16: login, consent, selfie clock-in, server geofence/off-site OK; crashed on the first background GPS fix (missing `RECEIVE_BOOT_COMPLETED`, fixed in the next build) |
| Core loop screens | 19–24 Oct | ✅ built 9 Oct — requests & roster, scheduling with grade/training checks, replacements, live map, consent, daily report publish, CSV exports (attendance, payroll, billing), SPG onboarding, venues, campaigns, accounts. Verified on staging via SQL as each role and in a mocked-backend browser run; not yet on a real phone |
| Reports, payroll export, pilot (5 SPG) | 26–30 Oct | ⬜ |
| Go-live: first Grab request | 2 Nov | ⬜ |

## Backend (Supabase)

Migrations in `supabase/migrations/`, applied in filename order to a Supabase project in the Singapore region:

| File | What it does |
|---|---|
| `0001_grab_schema.sql` | 6 roles, cities, venues, campaigns, requests (SLA hiring), trainings, shifts (grade + training gates, overtime split), attendances (server geofence, lateness, immutable clock-in), selfies split out, route points, KPI logs (template + proof rules), exceptions, replacements (SLA), validation, billable view, daily report, live map, audit log, RLS |
| `0002_storage.sql` | Private `selfies` and `kpi-proof` buckets; Grab never reads selfies. Supabase-only |
| `0003_scheduled_jobs.sql` | Auto-close >16 h sessions, 12-month retention purge, pg_cron: no-shows every 5 min, daily report 06:00 WIB, hourly auto-close, nightly retention |
| `0004_client_errors.sql` | Crash log for the app when Sentry is off (from the reference repo) |
| `0006_core_loop.sql` | Request lifecycle (new → staffed → running → closed, SLA stop at `staffed_at`), replacements (`open_replacement`, fill by scheduling), consent gate on clock-in with server-stamped time, SPG photo column, FK indexes, per-query `auth.uid()` |
| `0007_profile_photos_storage.sql` | Private `profile-photos` bucket: staff upload, Grab can see (roster). Supabase-only |
| `0008_campaign_kpi_lock.sql` | KPI fields fixed once SPG have logged against them |
| `0009_audit_hardening.sql` | Audit 11 Oct 2026 (`docs/audit/`): API callers cannot set shift status/validation/overtime (billing), request SLA fields, the clock-in selfie, or another person's consent; daily report no longer counts replaced shifts. Applied to staging 11 Oct 2026 |
| `0010_late_arrival_and_resolve.sql` | No clock-in on a shift already marked no-show (the SPG is told to call the PIC); resolving an already-closed exception says so. Applied to staging 11 Oct 2026 |
| `0011_anon_grants_tidy.sql` | Signed-out callers execute no function at all (two helpers had slipped through); `retention_months()` gets a fixed `search_path`. Applied to staging 11 Oct 2026 |
| `0012_kpi_outlier.sql` | KPI outlier: a shift total at 3x or more the 7-day median of the same campaign field (at least 5 shifts to compare) opens a `kpi_outlier` exception, which blocks billing until the PIC resolves or waives it. Applied to staging 15 Oct 2026 |
| `0013_clock_in_accuracy.sql` | Clock-in GPS accuracy from the phone (bug B1, phone test 15 Oct): never negative, fixed once written like the rest of the clock-in, and named in the off-site exception ("Jarak 15164 m dari venue (akurasi ±2000 m)") so the PIC can tell a bad fix from an SPG away from the venue. Geofence rules unchanged. Applied to staging 15 Oct 2026 |
| `0005_hardening.sql` | From the Supabase security advisor: signed-out callers execute no function, trigger functions are not callable over the API, fixed `search_path` everywhere |

Rules that live in the database, not the phone:

- New accounts start inactive; only the service role grants a role (`handle_new_auth_user`).
- Shift scheduling rejects SPG below the request's grade or without a training pass for the campaign.
- Clock-in: geofence distance, `geo_valid` (mock GPS never valid) and lateness are computed by the server; clock-in fields are immutable; one clock-out.
- Exceptions raised automatically: off-site, late (>15 min), late sync (>12 h), short shift (>30 min short), no clock-out, no-show (30 min after start, with a replacement task due in 1 / 2 working days).
- A shift is billable only when done, validated by the PIC, and with no open exception.
- `grab_viewer` reads attendance, KPI, live map and published reports — never selfies, phone numbers or GPS history.

### Test the backend

```bash
./scripts/test-db.sh
```

Spins up a throwaway Postgres (needs PostgreSQL 15+ server binaries; without them, `npm run test:db:docker` runs the same script in `postgres:16`), applies the stub of Supabase's `auth`
schema, every migration except storage, and runs `supabase/tests/10_smoke.sql`. The run stops at the first
failed check. CI runs the same script on every push.

## App (Expo — Android, iOS, web from one codebase)

```bash
cp .env.example .env      # fill in the Supabase URL and anon key
npm install
npx expo start            # w = web; Android/iOS background GPS needs a dev client (npm run build:dev)
```

| Role | Tab "Hari Ini" |
|---|---|
| SPG / coordinator | Today's shifts (plus any earlier shift still clocked in, on top, so a forgotten clock-out can still be done) → clock-in with front-camera selfie and a geofence preview → KPI per campaign field (camera proof when required, no customer data) → clock-out. Works without signal: writes queue in order and photos upload at replay. Background GPS runs while a shift is open |
| PIC / super admin | Today's numbers, open exceptions with a required note to resolve or waive, finished shifts ready to validate |
| Back office / Grab | Same view, read-only |

Reused unchanged from `spc-nc-workforce`: UI kit, dialogs, theme, offline replay rules, route buffer and sync, background
location task, tracking watcher, offline snapshot, error reporting. Rewritten for Grab: types, store, mappers,
storage (private `selfies` / `kpi-proof` buckets), geofence helper, screens.

Checks: `npm run typecheck`, `npm run lint`, `npm test` (94 unit tests, including the edge-function logic), `npm run test:db` (88 database checks).
CI runs all of them plus Expo doctor and a web bundle on every push.

Tabs per role: SPG/coordinator — Hari Ini, Jadwal (coordinator also Peta), Profil, after a one-time UU PDP consent.
PIC/super admin — Hari Ini, Request, Peta, Laporan, Data, Profil. Back office — same without scheduling rights.
Grab — Hari Ini, Request (read + submit), Peta, Laporan (published only).

Edge function `supabase/functions/admin-users` (deployed to staging): create accounts, reset passwords, (de)activate.
Super admin for any role; back office for SPG/coordinators only.

UI smoke test without a backend: `scripts/ui-smoke.mjs` (see its header).

### Retention (decision D5: selfies and GPS trails deleted after 12 months)

1. **19:30 UTC (02:30 WIB)** — pg_cron `grab-retention` runs `purge_expired_personal_data()`: deletes old selfie
   references and route points, and queues the selfie objects in `media_purge_queue`.
2. **Edge function `supabase/functions/purge-media`** deletes the queued objects from the `selfies` bucket and
   dequeues them. Only the `selfies` bucket and `<uid>/<file>` paths are touched; anything else stays queued and is
   reported. Service role only — user tokens are refused. Logic and tests: `purge.ts`, `purge.test.ts`.

Deploy and schedule it once per project (an operator step: the service key goes in Supabase Vault, never in the repo):

```sql
-- after deploying supabase/functions/purge-media (JWT verification on)
create extension if not exists pg_net;
select vault.create_secret('<service-role key>', 'service_role_key');
select cron.schedule('grab-purge-media', '0 20 * * *', $job$
  select net.http_post(
    url     := 'https://<project-ref>.supabase.co/functions/v1/purge-media',
    headers := jsonb_build_object('Authorization', 'Bearer ' ||
                 (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')))
$job$);
```

20:00 UTC = 03:00 WIB, half an hour after the SQL step. The response (purged / skipped / errors) is in
`net._http_response` and the function logs.

### Android build for the pilot (EAS)

`.env` is not uploaded to EAS, so the `development` and `preview` profiles in `eas.json` carry the staging URL and
publishable key themselves (public values; access control is RLS). Production gets its own project and keys.

```bash
npm i -g eas-cli
eas login                      # SPC's Expo account
eas init                       # done 15 Oct 2026: owner deuz-osss-team, extra.eas.projectId in app.json
eas build -p android --profile preview      # installable APK for the 5-SPG pilot (staging backend)
eas build -p android --profile development  # dev client, only if debugging on the phone
```

The build page gives a QR / link to install the APK. Android will ask to allow installs from that source.
The Android `versionCode` lives on EAS (`appVersionSource: remote`) and goes up by one on every `preview` and
`production` build, so each APK on an SPG's phone can be told apart. The first three preview builds (15 Oct) all
carry versionCode 1. The build number shows at the bottom of the Profil tab ("Versi aplikasi 1.0.0 (build 4)") and goes with every crash report in `client_errors.app_version`.

Android permissions are listed explicitly in `app.json` (`src/tasks/androidPermissions.test.ts` checks them): the
background location task needs `RECEIVE_BOOT_COMPLETED` (without it the app crashed on the first GPS fix, 15 Oct).
`RECORD_AUDIO` (video in expo-image-picker) and `SYSTEM_ALERT_WINDOW` are blocked — photos only. The storage
permissions expo-image-picker declares for Android 12 and older are kept until camera and gallery are checked on an
older phone without them.

## Open items (from the spec)

- Edge function `purge-media` deployed to staging 11 Oct 2026 (version 1, source identical to `main`) but **not yet scheduled** — needs the service key in Vault (see "Retention" below).
- Billing lines per month (P2), Grab self-service request form (P2). KPI outlier rule done in `0012` (3x the 7-day median, at least 5 shifts to compare).
- Inherited from the reference: iOS background location unvalidated, EAS production build never run, push unverified,
  map tiles must move to a keyed provider before go-live.
- `assets/` icons are the programme's own (amber shift pass on ink, 15 Oct; generator kept outside the repo). Swap for SPC brand artwork if SPC has one — same filenames and sizes.
- `src/lib/database.types.ts` is generated from staging; regenerate after every migration.
- The Supabase MCP connector refuses SQL containing DELETE: such migrations are pasted into the SQL Editor (as done for the retention purge).
