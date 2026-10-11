# Initial audit — SPC Grab SPG

Date: 11 Oct 2026 · Branch `main` at `7dd5f35` · Working tree clean at start (no uncommitted user work).
Scope: whole repository — Supabase backend (migrations, RLS, triggers, cron jobs, edge function), the Expo app
(Android / iOS / web from one codebase), tests, CI and build. Findings are numbered by area: **A-DB** database,
**A-SEC** security, **A-APP** app logic, **A-UX** design/usability, **A-A11Y** accessibility, **A-OPS** build and
tooling. Severity: P0 critical · P1 high · P2 medium · P3 low.

## 1. What the product is

Field platform for PT Sinergi Performa Cipta (SPC) running SPG/SPB staff for PT Grab Teknologi Indonesia.
Core loop: Grab request → PIC schedules SPG (grade + training gates) → SPG clocks in with a selfie inside the venue
geofence → logs KPI per campaign field → clocks out → server raises exceptions (off-site, late, short shift,
no-show, no clock-out, late sync) → PIC resolves/waives and validates → daily report published to Grab →
CSV exports for attendance, payroll and the monthly invoice (validated SPG-days).

Six roles: `super_admin`, `pic`, `back_office`, `coordinator`, `spg`, `grab_viewer`. Business rules live in
Postgres (RLS, triggers, security-definer RPCs); the app hides what a role never uses, the database enforces it.

## 2. Architecture inventory

| Layer | Implementation |
|---|---|
| App runtime | Expo 57, React Native 0.86, React 19.2, react-native-web 0.21, TypeScript 6 (strict) |
| Entry | `index.ts` (Sentry, background location task) → `App.tsx` (fonts, navigation, role-based tabs) |
| Navigation | Bottom tabs per role; native stacks for Request (list → form → detail) and Data (home → SPG detail / account / venue / campaign forms) |
| State | One zustand store `src/store/useStore.ts`: loads 45 days of data at login, offline queue (clock-in, clock-out, KPI) replayed in order (`src/store/replay.ts`), on-device snapshot for cold starts without signal |
| Backend | Supabase (Singapore). Migrations `0001`–`0008`; RLS on every table; server-computed geofence, lateness, overtime, SLA, exceptions; `pg_cron` jobs (no-shows, auto-close, daily report, retention, request status) |
| Storage | Private buckets `selfies`, `kpi-proof`, `profile-photos`; signed URLs |
| Edge function | `admin-users`: create accounts, reset passwords, (de)activate; re-checks caller role with the service key |
| Maps | Leaflet 1.9.4 from unpkg with SRI, in a WebView (native) or `srcdoc` iframe (web) |
| Tests | 66 unit tests (`node:test` via tsx, pure modules); 64 SQL smoke checks on Postgres 16 (`scripts/test-db.sh`); `scripts/ui-smoke.mjs` (Playwright against a mocked API) |
| CI | `.github/workflows/app.yml` (tsc, eslint, unit tests, expo-doctor, web export), `db.yml` (migrations + smoke) |

Routes / screens inventoried (all 17): Login, Consent, SPG Hari Ini, SPG Jadwal, Ops Hari Ini (PIC/BO/Grab),
Request list, Request form, Request detail, Peta live, Laporan (reports + CSV exports), Data home (SPG / Venue /
Campaign / Akun staf tabs), SPG/account detail, Account form, Venue form, Campaign form, Profil, error boundary.

## 3. Baseline (before any change)

| Check | Command | Result |
|---|---|---|
| Type check | `npx tsc --noEmit` | ✅ pass |
| Lint | `npx eslint .` | ❌ **1 error** — `scripts/ui-smoke.mjs:6 Unable to resolve path to module 'playwright'` (not declared in package.json). CI runs the same command, so the App workflow cannot be green. |
| Unit tests | `npm test` | ✅ 66 / 66 |
| DB migrations + RLS smoke | `scripts/test-db.sh` in `postgres:16` (no local Postgres on this machine) | ✅ 64 / 64 |
| Production web build | `npx expo export --platform web` (placeholder Supabase env, as CI) | ✅ exit 0 |
| Browser run | web export + Playwright (Chromium 151) against a mocked Supabase API, roles PIC / Grab / back office / SPG / coordinator, 320–1280 px | ran; console clean; defects below |
| axe-core 4.10 (WCAG 2.0–2.2 A/AA) | injected per screen | `color-contrast` (every screen), `aria-hidden-focus` (every tab screen), `aria-required-attr` (request detail) |
| CI status on GitHub | `gh run list` | not verifiable — GitHub API unreachable from this machine (TLS handshake timeout) |

## 4. Confirmed defects

### Security / privacy

| ID | Sev | Where | Evidence | Root cause | Impact |
|---|---|---|---|---|---|
| A-SEC-01 | **P1** | `src/components/LeafletMap.tsx` | Browser run: a profile named `Rina <img src=x onerror=…>` in `live_positions()` ⇒ the tooltip contains the raw `<img>`, the handler runs, and it sets a flag **in the app window** (`parent.__xss`); from the map frame `parent.localStorage` was readable (3 keys incl. the Supabase session). | Marker labels (SPG and venue names) are passed to Leaflet `bindTooltip`, which sets `innerHTML`; the web iframe was `sandbox="allow-scripts allow-same-origin"` on a `srcdoc` document, i.e. same origin as the app. An SPG can edit their own `profiles.name` (RLS `profiles_update` allows self-update). | Stored XSS: any SPG can run script in the PIC's / Grab's browser session and take over the account (session token in localStorage). |
| A-DB-01 | **P1** | `shifts` RLS (`shifts_write`, `shifts_update`) | SQL as PIC: insert a shift with `status='done', validated_at=now()` — accepted; `update shifts set status='done'` on an unworked shift — accepted. The row then appears in `billable_shifts` and payroll. | RLS checks *who* (`is_ops()`), nothing checks *which columns*. `validate_shift()`'s "no open exception" rule and the clock-out-only path to `done` can be bypassed with a direct write; `overtime_hours` is editable too. | Invoice and payroll can include shifts nobody worked; overtime can be inflated. |
| A-DB-02 | P2 | `requests` | SQL: insert with `staffed_at = now()` kept; update of `sla_hiring_due`, `staffed_at`, `submitted_at`, `status` accepted. | `requests_server_fill` sets SLA fields on insert only for some columns; nothing protects them afterwards. | Hiring-SLA report (a contractual metric) can be falsified. |
| A-DB-03 | P2 | `attendance_media` (`media_update`) | SQL: SPG with an open attendance can `update attendance_media set selfie_in_path = …`. | The update policy exists for a clock-out selfie; it allows every column. | Clock-in selfie (attendance evidence) can be swapped for a later photo. |
| A-DB-04 | P2 | `profiles` (`profiles_update` + consent gate) | SQL as PIC: `update profiles set consent_version = …` on an SPG — accepted; clock-in consent gate then passes. | Staff may update any profile; consent is not restricted to its subject. | UU PDP consent can be recorded without the data subject. |

### Functional / data

| ID | Sev | Where | Evidence | Root cause | Impact |
|---|---|---|---|---|---|
| A-APP-01 | **P1** | `src/utils/storage.ts` `localPhotoExists` | Browser run, SPG web: "Clock-in dengan selfie" → pick photo ⇒ dialog **"Gagal Clock-in — Foto tidak ditemukan di HP"**, zero requests sent. Same path for KPI with proof photo. | `expo-file-system` legacy `getInfoAsync` is unavailable on web (throws `UnavailabilityError`), the catch returns `false`, replay returns `dropped`. | Clock-in and proof-photo KPI impossible on the web app. |
| A-APP-02 | **P1** | `useStore.loadAll`, `fetchExportData` | Code: plain `select('*')` without range. Supabase/PostgREST returns at most `max_rows` = 1000 rows and does not report truncation. | No pagination. | Attendance, **payroll and billing CSVs** silently miss rows once a period has > 1000 shifts / KPI rows; screens silently miss data at national scale. |
| A-APP-03 | P2 | `CampaignFormScreen` | Browser run: open an existing campaign with `ends_on = 2026-12-31`, press Save ⇒ PATCH body has no end date preserved (field initialised to `''`, sent as `ends_on: null`). | `Campaign` model did not carry `starts_on`/`ends_on`; the form started empty. | Every campaign edit (even toggling Aktif) erases its end date. |
| A-APP-04 | P2 | `useStore.init` | Code: restored session → `loadAll` → no `active` check (signIn has one). | Inconsistent auth handling. | Deactivated user reopening the app sees an empty app (RLS hides everything) with no explanation. |
| A-APP-05 | P2 | `SpgTodayScreen.currentPosition` | Code: `getCurrentPositionAsync({ accuracy: High })` without timeout; the existing `requestCurrentCoords` (bounded + fallback) unused. | Duplicate, weaker implementation. | Clock-in can spin indefinitely indoors (malls); clock-out had the same path. |
| A-DB-05 | P2 | `build_daily_report` | SQL: a future shift replaced via `open_replacement` still counted in `planned`. | Filter excluded `cancelled` only, unlike the roster rule (`isLive`, `refresh_request_status`). | Daily report to Grab double-counts replaced roster slots. |
| A-APP-06 | P2 | `OpsTodayScreen` "Validasi semua" | Code: `validateShift` reloads all 13 tables after every shift. | Reload inside the loop. | N × 13 requests for a bulk validation; slow on field connections. |
| A-APP-07 | P3 | `SpgDetailScreen` | Code: `fetchPhones()` downloads every staff phone number to show one. | Over-fetch. | Unnecessary personal-data transfer. |

### Accessibility / UX

| ID | Sev | Where | Evidence | Impact |
|---|---|---|---|---|
| A-A11Y-01 | P2 | Bottom tabs (all roles) | axe `color-contrast` serious, 5 nodes per screen: inactive tab labels in the library default grey (~3:1). | Navigation labels below WCAG 1.4.3. |
| A-A11Y-02 | P2 | Web tab screens | axe `aria-hidden-focus`; keyboard trace from "Hari Ini" tabbed into "Request baru / Aktif / Semua" of the hidden Request tab. | Keyboard users walk through invisible screens (2.4.3, 4.1.2). |
| A-A11Y-03 | P2 | `ui.tsx` Chip / Btn / ListRow | axe `aria-required-attr` critical (role=checkbox without `aria-checked`) on request detail. react-native-web 0.21 ignores `accessibilityState`, so selected / disabled / busy / checked were never exposed on web. | State of pickers and buttons not announced (4.1.2). |
| A-A11Y-04 | P2 | Every form (`Field`) and two bare inputs | Harness: inputs without accessible name (login, request form, venue, campaign, exception note, search). | Inputs announced as "edit text" without purpose (1.3.1, 4.1.2). |
| A-UX-01 | P2 | Laporan | One tap on "Terbitkan ke Grab" / "Buat & terbitkan" publishes to the client; published reports are frozen. | Irreversible outward-facing action without confirmation. |
| A-UX-02 | P3 | Desktop web (PIC) | Screenshots at 1280 px: content stretches edge to edge, 600 px buttons, ~150-character lines. | Hard to scan on the PIC's main device. |
| A-UX-03 | P3 | Request detail, open replacements | Title truncated "Kordinator Sby · 2026-…" next to the action button. | Date of the replacement hidden. |

### Build / tooling

| ID | Sev | Evidence | Impact |
|---|---|---|---|
| A-OPS-01 | P2 | Lint error above. | CI App workflow red on every push. |
| A-OPS-02 | P3 | `scripts/test-db.sh` needs local PostgreSQL server binaries; on Windows checkouts (CRLF) it fails with `set: pipefail: invalid option`. | DB tests not runnable on contributor machines without Postgres. |

## 5. Risks and observations (not defects, or need a product decision)

- **A-RISK-01 (P3)** SPG arriving after the no-show job (30 min) can still clock in; the shift stays `no_show` and is never billable while a replacement is open. Plausibly intended — product decision.
- **A-RISK-02 (P3)** `settle()` treats `23505` as success; for KPI that also covers a *different* log for the same `(shift, field)` (two devices). The UI shows one entry per field so it is not reachable from one phone.
- **A-RISK-03 (P3)** `resolve_exception` silently does nothing for an already-closed exception (two PICs at once): the second sees a success toast.
- **A-RISK-04 (P3)** Edge function returns raw `err.message` on 500; CORS `*` is acceptable (bearer token, no cookies).
- **A-RISK-05** Known open items from README remain: purge-media edge function, keyed map tiles before go-live, placeholder app icons, iOS background location and EAS builds unverified.
- **A-RISK-06** Migration `0009` (this audit) is not applied to staging — applying it is an operator action.
- Performance: list screens render plain `ScrollView` + `.map` (no virtualisation); fine at pilot scale (5 SPG), revisit beyond a few hundred rows per screen. Login loads 45 days in 13 parallel queries.

## 6. Remediation plan (in the order executed)

1. P1 security & billing integrity: A-SEC-01, A-DB-01 (+ A-DB-02…05 in the same migration `0009`).
2. P1 functional: A-APP-01 web clock-in, A-APP-02 pagination of every list and export.
3. P2 functional: A-APP-03…07.
4. P2 accessibility: A-A11Y-01…04.
5. P2/P3 UX: A-UX-01…03. Tooling: A-OPS-01, A-OPS-02.
6. Regression tests for each (SQL smoke + unit), browser re-run of every role at 320 / 390 / 768 / 1280 px.
