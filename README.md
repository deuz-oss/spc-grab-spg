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
| Foundation: backend | 13–17 Oct | ✅ schema, RLS, server rules, jobs — 48 smoke checks pass on Postgres 16 |
| Foundation: app scaffold + Android dev build | 13–17 Oct | ⬜ next |
| Core loop screens | 19–24 Oct | ⬜ |
| Reports, payroll export, pilot (5 SPG) | 26–30 Oct | ⬜ |
| Go-live: first Grab request | 2 Nov | ⬜ |

## Backend (Supabase)

Migrations in `supabase/migrations/`, applied in filename order to a Supabase project in the Singapore region:

| File | What it does |
|---|---|
| `0001_grab_schema.sql` | 6 roles, cities, venues, campaigns, requests (SLA hiring), trainings, shifts (grade + training gates, overtime split), attendances (server geofence, lateness, immutable clock-in), selfies split out, route points, KPI logs (template + proof rules), exceptions, replacements (SLA), validation, billable view, daily report, live map, audit log, RLS |
| `0002_storage.sql` | Private `selfies` and `kpi-proof` buckets; Grab never reads selfies. Supabase-only |
| `0003_scheduled_jobs.sql` | Auto-close >16 h sessions, 12-month retention purge, pg_cron: no-shows every 5 min, daily report 06:00 WIB, hourly auto-close, nightly retention |

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

## Open items (from the spec)

- Edge functions to port: `admin-users` (account provisioning), new `purge-media` (deletes objects in `media_purge_queue`).
- KPI outlier rule (P2), billing lines per month (P2), Grab self-service request form (P2).
- Inherited from the reference: iOS background location unvalidated, EAS production build never run, push unverified,
  map tiles must move to a keyed provider before go-live.
