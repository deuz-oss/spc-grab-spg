# Remediation log

Every finding from [INITIAL_AUDIT.md](INITIAL_AUDIT.md), what was changed, how it is tested, and how it was
verified. "Browser" = the production web export driven by Playwright (Chromium 151) against a mocked Supabase
API (same approach as `scripts/ui-smoke.mjs`); "SQL" = `scripts/test-db.sh` on Postgres 16.

| ID | Sev | Status |
|---|---|---|
| A-SEC-01 Stored XSS via live-map tooltips | P1 | FIXED |
| A-DB-01 Shifts billable without being worked | P1 | FIXED |
| A-APP-01 Web clock-in / proof KPI always rejected | P1 | FIXED |
| A-APP-02 Lists and CSV exports truncated at 1000 rows | P1 | FIXED |
| A-DB-02 Hiring-SLA fields writable | P2 | FIXED |
| A-DB-03 Clock-in selfie replaceable | P2 | FIXED |
| A-DB-04 Consent recordable by staff | P2 | FIXED |
| A-DB-05 Daily report counts replaced shifts | P2 | FIXED |
| A-APP-03 Campaign edit erases end date | P2 | FIXED |
| A-APP-04 Deactivated session opens an empty app | P2 | FIXED |
| A-APP-05 Clock-in location without timeout | P2 | FIXED |
| A-APP-06 Bulk validation reloads per shift | P2 | FIXED |
| A-A11Y-01 Tab label contrast | P2 | FIXED |
| A-A11Y-02 Hidden tab screens focusable (web) | P2 | FIXED |
| A-A11Y-03 Selected/disabled/checked state not exposed on web | P2 | FIXED |
| A-A11Y-04 Inputs without accessible names | P2 | FIXED |
| A-UX-01 Publish to Grab without confirmation | P2 | FIXED |
| A-OPS-01 Lint error, CI red | P2 | FIXED |
| A-APP-07 All phone numbers fetched to show one | P3 | FIXED |
| A-UX-02 Desktop content stretched edge to edge | P3 | FIXED |
| A-UX-03 Replacement title truncated | P3 | FIXED |
| A-OPS-02 DB tests need local Postgres | P3 | FIXED (Docker wrapper) |
| A-A11Y-05 `scrollable-region-focusable` on Peta (320 px) and read-only request detail | P3 | FIXED (follow-up) |
| A-OPS-03 24 npm advisories in Expo/Metro build tooling | P3 | PARTIALLY FIXED (24 → 16; no upstream fix for the rest) |
| A-RISK-01…04 Late arrival, duplicate KPI/clock-in, silent double resolve, edge-function error text | P3 | FIXED (follow-up; 0010 not yet on staging, edge function not yet redeployed) |

---

### A-SEC-01 — Stored XSS through live-map tooltips (P1)
- **Root cause:** marker labels (SPG and venue names; an SPG can rename themselves) went into Leaflet
  `bindTooltip`, which writes `innerHTML`. On web the map is a `srcdoc` iframe with
  `sandbox="allow-scripts allow-same-origin"`, so it ran with the app's origin and could read the Supabase
  session in `localStorage`.
- **Files:** `src/components/LeafletMap.tsx`, `src/utils/html.ts` (new), `src/utils/html.test.ts` (new).
- **Fix:** labels are HTML-escaped before they reach the map; the iframe sandbox is `allow-scripts` only, giving
  the map an opaque origin (defence in depth). Leaflet still loads (CORS + SRI) and tiles are plain images.
- **Regression test:** `html.test.ts` (markup becomes text; ordinary names unchanged).
- **Verification (browser, PIC and Grab):** before: tooltip HTML `Rina <img src="x" onerror=…>`, payload fired in
  the frame **and in the app window**, frame read 3 localStorage keys. After: tooltip
  `Rina &lt;img src=x …&gt;`, `xssFiredInFrame=false`, `xssFiredInApp=false`, storage access
  `blocked: SecurityError`, `window.L` loaded, markers and tooltips render.

### A-DB-01 — Unworked shifts could be billed (P1)
- **Root cause:** RLS (`shifts_write`, `shifts_update`) only checks `is_ops()`; a direct insert/update could set
  `status='done'`, `validated_at`, `overtime_hours`, bypassing `validate_shift()` and the clock-out path.
- **Files:** `supabase/migrations/0009_audit_hardening.sql` (`is_api_caller()`, `shifts_guard_api` trigger).
- **Fix:** for PostgREST roles (`authenticated`/`anon`): inserts are forced to `planned` with no validation;
  the only status change allowed is `planned → cancelled` (what the app does); `validated_at/by`,
  `overtime_hours`, `replaces_shift_id` are server-only. Server functions, cron jobs and the service role are not
  affected (their triggers run as the function owner) — the clock-out → done, `validate_shift`,
  `detect_no_shows` and `open_replacement` paths all still pass the existing smoke checks.
- **Regression tests (SQL):** forged insert comes out planned/unvalidated with server overtime; not billable;
  `status='done'`, `validated_at`, `overtime_hours` updates refused; cancel still works.
- **Verification:** SQL 79/79. Negative control: the same suite **without** `0009` fails at
  "a shift cannot be inserted already done, validated, or with made-up overtime".

### A-APP-01 — Web clock-in and proof-photo KPI always failed (P1)
- **Root cause:** `localPhotoExists` used `expo-file-system` `getInfoAsync`, unavailable on web; the catch
  returned `false` and replay dropped the op.
- **Files:** `src/utils/storage.ts`.
- **Fix:** on web, check the picker's `data:`/`blob:` URI with `fetch(uri).ok` (also correctly reports a
  `blob:` lost after a reload, instead of retrying forever).
- **Verification (browser, SPG):** before: dialog "Gagal Clock-in — Foto tidak ditemukan di HP. Ambil ulang
  fotonya.", 0 requests. After: `upload selfies/u-spg/a_….jpg` → `POST attendances` → `POST attendance_media`,
  pass shows "Sedang bertugas" and the KPI form.

### A-APP-02 — Data and exports truncated at 1000 rows (P1)
- **Root cause:** unpaged `select('*')`; PostgREST's `max_rows` (1000 on Supabase) truncates silently.
- **Files:** `src/utils/paging.ts` (new), `src/utils/paging.test.ts` (new), `src/store/useStore.ts`.
- **Fix:** `fetchAllPages` reads `.range()` pages with a deterministic `.order('id')` until a short page; used for
  every list in `loadAll` and every query in `fetchExportData` (shifts, attendances, KPI, exceptions, requests
  in chunks of 200 ids).
- **Regression tests:** 2 500 rows behind a 1 000-row cap are read completely in 3 requests; one request when it
  fits; exact-multiple edge case; errors propagate.
- **Verification:** unit tests; browser runs load every screen through the paged path (mock honours
  `offset`/`limit`), no console errors.

### A-DB-02 / A-DB-03 / A-DB-04 / A-DB-05 (P2) — migration `0009`
- **A-DB-02 Requests:** `requests_guard_api` — `staffed_at` cleared on insert; `submitted_at`, `submitted_by`,
  `sla_hiring_due`, `staffed_at` immutable for API callers; status can only be set to `cancelled`.
  Tests: insert with `staffed_at` comes out null; SLA move, backdated staffed time, status `staffed` refused;
  cancel works.
- **A-DB-03 Selfies:** `attendance_media_guard_api` — `selfie_in_path` and `attendance_id` fixed once written;
  `selfie_out_path` can still be added. Tests: swap refused, clock-out selfie accepted.
- **A-DB-04 Consent:** `profiles_guard_consent` — only the account owner may change `consent_version`.
  Tests: PIC setting an SPG's consent refused; the SPG's own consent (existing test) still works.
- **A-DB-05 Daily report:** `build_daily_report` counts `planned` as `status not in ('cancelled','replaced')`,
  the same rule as the roster. Test: report for the day of a replaced shift → planned 0.
- **Verification:** SQL 79/79 (15 new checks).

### A-APP-03 — Campaign edit erased the end date (P2)
- **Files:** `src/types.ts`, `src/store/mappers.ts`, `src/screens/data/CampaignFormScreen.tsx`,
  `src/store/mappers.test.ts`, `src/utils/exports.test.ts`.
- **Fix:** `Campaign` carries `startsOn`/`endsOn`; the form starts from the saved values and rejects an end date
  before the start.
- **Verification:** unit test (dates mapped, null kept); browser: saving an unchanged campaign sends
  `"ends_on":"2026-12-31"` (before: the field started empty and was saved as `null`).

### A-APP-04 — Deactivated account with a stored session (P2)
- **Files:** `src/store/useStore.ts` (`init`, `loginNotice`), `src/screens/LoginScreen.tsx`.
- **Fix:** after loading, an inactive profile is signed out and the login screen says
  "Akun Anda dinonaktifkan. Hubungi PIC SPC." The offline queue stays on the device (unchanged behaviour of
  `signOut`).
- **Verification:** type check + code review; not reproducible in the mock run without a session-restore fixture.

### A-APP-05 — Clock-in location could hang indoors (P2)
- **Files:** `src/screens/SpgTodayScreen.tsx`.
- **Fix:** uses `requestCurrentCoords` (12 s high accuracy, then 8 s balanced); clear message on failure;
  clock-out falls back to the clock-in position when no fix is available (as before for a denied permission).
- **Verification:** browser clock-in with granted geolocation succeeds; failure path by code review.

### A-APP-06 — "Validasi semua" (P2)
- **Files:** `src/store/useStore.ts` (`validateShifts`), `src/screens/OpsTodayScreen.tsx`.
- **Fix:** one RPC per shift (each still checked by `validate_shift`), one reload at the end; the error message
  keeps "N dari M shift tervalidasi".
- **Verification:** type check; browser renders the queue; single and bulk paths share the function.

### A-APP-07 — Phone numbers over-fetched (P3)
- **Files:** `src/store/useStore.ts` (`fetchPhone`), `src/screens/data/SpgDetailScreen.tsx`.
- **Verification:** browser: SPG detail shows "HP 081234567890" via `profile_contacts?user_id=eq.u-spg`.

### A-A11Y-01…04 (P2)
- **01 contrast:** `tabBarInactiveTintColor: C.muted` (7:1) — `App.tsx`.
- **02 hidden screens:** `enableScreens(true)` on web so inactive tabs are `display:none` — `App.tsx`.
- **03 state:** `ui.tsx` Chip/Btn/ListRow use `aria-*` props (react-native-web ignores `accessibilityState`;
  React Native maps `aria-*` to the same native state). Toggle chips are `aria-pressed` on web.
- **04 names:** `Field` gives a directly nested `Input` its label (plus "wajib") as accessible name; the two bare
  inputs (exception note, account search) got explicit labels — `ui.tsx`, `OpsTodayScreen.tsx`,
  `DataHomeScreen.tsx`.
- **Verification (browser, axe-core 4.10, all roles, 320/390/768/1280 px):** `color-contrast`,
  `aria-hidden-focus`, `aria-required-attr` → 0. Unlabeled visible inputs → 0. Keyboard trace from "Hari Ini" now
  goes note → Selesai → Kecualikan → Validasi → tab bar (before: into the hidden Request tab).
  See [FINAL_VERIFICATION.md](FINAL_VERIFICATION.md) for counts.

### A-UX-01 — Publish confirmation (P2)
- **Files:** `src/screens/ReportsScreen.tsx`.
- **Verification (browser):** one tap on "Terbitkan ke Grab" opens "Terbitkan laporan Kamis, 8 Oktober? Grab
  langsung bisa membacanya, dan laporan yang sudah terbit tidak bisa diubah lagi." and sends **no** request until
  confirmed.

### A-UX-02 / A-UX-03 (P3)
- **02:** `MAX_CONTENT_WIDTH = 960` (`src/theme.ts`); tab scenes and stack content are centred, header and tab
  bar stay full width, page colour behind the column (`App.tsx`). Verified on 1280 px screenshots.
- **03:** replacement row title wraps to two lines (`RequestDetailScreen.tsx`).

### A-OPS-01 / A-OPS-02
- **01:** `playwright` (~1.63) added to devDependencies (package only; browsers are not downloaded by
  `npm ci`). `npx eslint .` → 0 problems.
- **02:** `scripts/test-db-docker.sh` + `npm run test:db:docker`: runs `test-db.sh` unchanged inside
  `postgres:16`, mounting only `supabase/` and `scripts/`, stripping CRLF inside the container.

### Follow-ups (branch `audit/p3-followups`, 11 Oct 2026) — the items first deferred

- **A-RISK-01 Late arrival after the no-show job — FIXED (decision: refuse).** Migration
  `0010_late_arrival_and_resolve.sql`: `attendances_server_checks` refuses a clock-in on a `no_show` shift with
  "Shift ini sudah ditandai tidak hadir … Hubungi PIC." The app now shows the server's reason instead of the generic
  "Server menolak data ini" (`useStore.runOrQueue`, `lastRefusal`). SQL test: clock-in on the no-show shift refused.
  Negative control without `0010` fails at that check.
- **A-RISK-02 Duplicate-key treated as "sent" — FIXED.** `settleOwnInsert` (`src/store/replay.ts`): a `23505` on
  clock-in or KPI replay counts as landed only if the row with the op's own id is on the server; otherwise
  another device holds the slot and the op is refused with "sudah clock-in / sudah tercatat dari HP lain".
  4 unit tests.
- **A-RISK-03 Silent double resolve — FIXED.** `resolve_exception` raises "Exception ini sudah ditutup (mungkin
  oleh PIC lain)"; the store reloads before surfacing the error, so the closed card leaves the screen. SQL test.
- **A-RISK-04 Edge function leaked internal error text — FIXED in code.** `admin-users` logs the error and returns
  a generic message on 500. Needs a redeploy of the function to reach staging.
- **A-A11Y-05 `scrollable-region-focusable` — FIXED.** `scrollRegion()` in `ui.tsx`: on web the screen's scroll
  container is a focusable, named region (Peta live, Detail request, Jadwal saya). Native unchanged. Browser:
  axe violations **0** across Grab, PIC, back office, coordinator, SPG running — 105 screen × viewport
  combinations, no console errors.
- **A-OPS-03 npm advisories — PARTIALLY FIXED.** `uuid` forced to `^11.1.1` with an npm `overrides` entry (its
  two dependents, `xcode` and `@expo/ngrok`, only call `require('uuid').v4()`, present in v11 CJS) → audit
  24 → 16, moderate 8 → 0. The remaining 16 come from `braces@3.0.3` (GHSA-vfj7-8cjw-p6xm) and `node-forge@1.4.0`
  (GHSA-86w9-cpqp-85rv): the vulnerable version **is the latest published release** of each, so there is no
  version to move to. Both are build tooling (Metro file watching, Expo CLI code signing), not app runtime.
  Re-check when either publishes a fix.
