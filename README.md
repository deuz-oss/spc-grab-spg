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
| Foundation: backend | 13–17 Oct | ✅ schema, RLS, server rules, jobs — 64 smoke checks pass on Postgres 16 |
| Foundation: app scaffold | 13–17 Oct | ✅ login, SPG today (selfie clock-in, KPI, clock-out, offline queue), PIC/Grab today (exception queue, validation), profile — tsc, lint, 56 unit tests, web bundle green |
| Supabase staging (`irsgynzhdlwnbvcjynqf`, Singapore, free plan) | 9 Oct | 🟡 all migrations applied except the retention purge (part of 0003; the connector refuses SQL containing DELETE, so it is pasted in the SQL Editor). 3 of 4 cron jobs live. Demo data from `supabase/seed/staging_demo.sql` (6 accounts, one per role) |
| Foundation: Android dev build on a real phone | 13–17 Oct | ⬜ needs EAS project |
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

Spins up a throwaway Postgres (needs PostgreSQL 15+ server binaries), applies the stub of Supabase's `auth`
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
| SPG / coordinator | Today's shifts → clock-in with front-camera selfie and a geofence preview → KPI per campaign field (camera proof when required, no customer data) → clock-out. Works without signal: writes queue in order and photos upload at replay. Background GPS runs while a shift is open |
| PIC / super admin | Today's numbers, open exceptions with a required note to resolve or waive, finished shifts ready to validate |
| Back office / Grab | Same view, read-only |

Reused unchanged from `spc-nc-workforce`: UI kit, dialogs, theme, offline replay rules, route buffer and sync, background
location task, tracking watcher, offline snapshot, error reporting. Rewritten for Grab: types, store, mappers,
storage (private `selfies` / `kpi-proof` buckets), geofence helper, screens.

Checks: `npm run typecheck`, `npm run lint`, `npm test` (66 unit tests), `npm run test:db` (64 database checks).
CI runs all of them plus Expo doctor and a web bundle on every push.

Tabs per role: SPG/coordinator — Hari Ini, Jadwal (coordinator also Peta), Profil, after a one-time UU PDP consent.
PIC/super admin — Hari Ini, Request, Peta, Laporan, Data, Profil. Back office — same without scheduling rights.
Grab — Hari Ini, Request (read + submit), Peta, Laporan (published only).

Edge function `supabase/functions/admin-users` (deployed to staging): create accounts, reset passwords, (de)activate.
Super admin for any role; back office for SPG/coordinators only.

UI smoke test without a backend: `scripts/ui-smoke.mjs` (see its header).

## Open items (from the spec)

- Edge function still to write: `purge-media` (deletes storage objects listed in `media_purge_queue`; the SQL side runs nightly).
- KPI outlier rule (P2), billing lines per month (P2), Grab self-service request form (P2).
- Inherited from the reference: iOS background location unvalidated, EAS production build never run, push unverified,
  map tiles must move to a keyed provider before go-live.
- `assets/` still holds the reference repo's placeholder icons (gold "NC" badge). Replace with SPC / programme artwork
  before any build is shown to Grab or installed by SPG — same filenames and sizes.
- `src/lib/database.types.ts` is generated from staging; regenerate after every migration.
- The Supabase MCP connector refuses SQL containing DELETE: such migrations are pasted into the SQL Editor (as done for the retention purge).
