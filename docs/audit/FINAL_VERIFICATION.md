# Final verification

Run on 11 Oct 2026, Windows 11, Node 22.23, on the working tree with every change of this audit (uncommitted).
All results below were produced by commands actually executed; nothing is extrapolated.

## Automated checks

| Check | Command | Baseline | Final |
|---|---|---|---|
| Type check | `npx tsc --noEmit` | ✅ | ✅ exit 0 |
| Lint | `npx eslint .` | ❌ 1 error (`playwright` unresolved) | ✅ 0 problems |
| Unit tests | `npm test` | ✅ 66/66 | ✅ **73/73** (new: `paging.test.ts` ×4, `html.test.ts` ×2, campaign dates in `mappers.test.ts`) |
| DB migrations + RLS smoke (Postgres 16) | `npm run test:db:docker` (= `scripts/test-db.sh` in `postgres:16`) | ✅ 64/64 | ✅ **79/79** (15 new checks for migration 0009) |
| Negative control | same suite with `0009` removed | — | ❌ fails at the first new check, as expected |
| Expo doctor | `npx expo-doctor` | not run | ✅ 21/21 |
| Production web build | `npx expo export --platform web` (placeholder Supabase env, as CI) | ✅ | ✅ exit 0 |
| Repo UI smoke | `scripts/ui-smoke.mjs` pic / grab_viewer / back_office / spg / spg consented, against the final build | not runnable (playwright missing) | ✅ all 5 ran, `ERRORS: []`; PIC scheduling still inserts a shift (compatible with the 0009 guard) |
| Dependency audit | `npm audit --omit=dev` | — | ⚠️ 24 (16 high, 8 moderate) from 3 advisories in Expo/Metro build tooling — deferred (A-OPS-03) |
| GitHub CI status | `gh run list` | not reachable (TLS timeout) | not reachable |

The last placeholder-text change (`mis. 2026-11-02`, `mis. -7.2625, 112.7389`) landed after the final browser
build; tsc, lint, unit and DB checks above were re-run after it.

## Security checks performed

- RLS / column-level abuse as each role in SQL (forged shift status, validation, overtime; forged request SLA
  fields and status; selfie swap; consent on behalf of another user) — all refused after `0009`, accepted before.
- Stored XSS through the live map, end to end in Chromium: blocked (escaped label, no script execution,
  `parent.localStorage` → `SecurityError`).
- Secrets: `.env` is git-ignored and untracked; the seed file uses placeholders; no keys printed in this audit.
- Edge function `admin-users` reviewed: caller role and `active` re-checked server-side, back office limited to
  field roles, self-deactivation blocked, actions audited.
- Not done: penetration testing of the live staging project (out of scope; `0009` not applied there).

## Browser workflows verified (final build)

Production web export in Chromium 151 via Playwright, mocked Supabase API, **119 screen × viewport
combinations** over six role configurations (PIC, Grab, back office, coordinator, SPG first login, SPG with a
running shift):

| Workflow | Result |
|---|---|
| Login → role tabs (all roles) | ✅ |
| SPG first login → consent → clock-in with selfie (file chooser on web) | ✅ upload → `attendances` → `attendance_media`; pass shows "Sedang bertugas" + KPI form (baseline: "Foto tidak ditemukan di HP", 0 requests) |
| SPG running shift: KPI counters, proof photo field, clock-out button | ✅ rendered and keyboard-reachable |
| PIC: exception triage, validation queue | ✅ |
| PIC: request list → detail → new request form | ✅ |
| PIC: schedule a shift (repo smoke) | ✅ `POST shifts` |
| PIC: publish daily report | ✅ confirmation dialog, **no request until confirmed** |
| PIC: edit campaign and save | ✅ `ends_on` preserved |
| PIC/BO: SPG detail with phone number | ✅ shows only that SPG's number |
| Live map (PIC, Grab, coordinator) | ✅ Leaflet loads in the sandboxed frame, hostile name rendered as text |
| Keyboard: Tab order from Hari Ini | ✅ stays on the visible screen, then tab bar (baseline: walked into hidden tabs) |

Console errors: **0** in every run (baseline: 0). Failed requests: only NetInfo's reachability `HEAD /` probe
against the test server (harness artefact).

## Viewports

320, 390, 768, 1280 px for every tab of every role; 390 px for stack screens (request detail/form, SPG detail,
campaign form). Horizontal overflow: none. Tap targets under 24 px: none.

## Accessibility scan (axe-core 4.10, WCAG 2.0/2.1/2.2 A + AA)

Baseline was run for the same six role configurations; back office (22 / 11) and coordinator (16 / 9) show the
same `color-contrast` / `aria-hidden-focus` pattern as the three shown here.

| Rule | Baseline (PIC / Grab / SPG) | Final (all roles) |
|---|---|---|
| `color-contrast` (serious) | 28 / 22 / 12 screen-viewports | 0 |
| `aria-hidden-focus` (serious) | 15 / 15 / 11 | 0 |
| `label` (critical) | login (every role), request form, request detail, SPG detail | 0 |
| `aria-required-attr` (critical) | request detail | 0 |
| `scrollable-region-focusable` (serious) | Peta 320 px; request detail (read-only roles) | unchanged (deferred A-A11Y-05) |

Manual: keyboard order and visible focus checked; screen readers (TalkBack / VoiceOver / NVDA) **not** tested.

## Remaining issues

| ID | Sev | Issue | Next step |
|---|---|---|---|
| A-RISK-06 | — | ✅ **Applied to staging** (`irsgynzhdlwnbvcjynqf`) on 11 Oct 2026 as migration version `20261011094820`. See "Staging deployment" below. | Rollback if ever needed: `drop trigger shifts_guard_api on public.shifts; drop trigger requests_guard_api on public.requests; drop trigger attendance_media_guard_api on public.attendance_media; drop trigger profiles_guard_consent on public.profiles;` and re-create `build_daily_report` from `0001`. |
| — | — | Supabase security advisor: *Leaked password protection disabled* (Auth setting, pre-existing). **Correction:** this feature needs the Supabase **Pro plan**; the staging organization is on the free plan, so it cannot be switched on there. Passwords are still checked at creation and reset (≥ 8 characters, letters and digits, not containing the username) by `admin-users`, the only way accounts are made. | Decide: upgrade the organization, or enable it on the production project (Pro) before go-live. |
| — | — | **Gap check 11 Oct 2026.** Staging compared with the repo object by object (columns 159, policies 36, triggers 24, RLS flags 18: identical; function bodies: 5 differ only by `--` comments the connector stripped). One real drift: `retention_months()` executable by `anon` on staging; `is_api_caller()` executable by `anon` in repo and staging. | Migration `0011_anon_grants_tidy.sql` (smoke check "anon can execute no function in public", 82/82; fails without it). Apply to staging. |
| — | — | `purge-media` edge function was the missing storage half of retention. | Written: `supabase/functions/purge-media` (6 unit tests; `deno check` clean; HTTP layer tested in Deno: GET 405, no/wrong key 403, service key reaches the purge). Deploy + schedule per README "Retention". |
| A-A11Y-05, A-RISK-01…04 | P3 | ✅ Fixed in the follow-up (see REMEDIATION_LOG "Follow-ups"): axe 0 violations over 105 screen × viewport combinations; DB smoke **81/81**; unit **77/77**. | `0010` applied to staging 11 Oct 2026 (version `20261011102801`): live check in a rolled-back transaction — late clock-in by `demo.spg` on a no-show shift refused with the new message, double resolve by `demo.pic` refused; data unchanged afterwards; advisor unchanged. `admin-users` edge function redeployed 11 Oct 2026 (version 2, JWT verification on): deployed source identical to `main`; preflight 200, unauthenticated POST 401. |
| A-OPS-03 | P3 | 16 high advisories remain (`braces@3.0.3`, `node-forge@1.4.0` — both already the latest release, no fix published); `uuid` fixed by override (24 → 16). | Re-run `npm audit` when either publishes a fix; do not `npm audit fix --force` (downgrades Expo). |
| — | — | Native Android/iOS, camera capture, background GPS, push — not exercised here (no device). | Pilot-phone pass per README phase "Android dev build on a real phone". |

### Reproduction for unresolved items
- **A-OPS-03:** `npm audit --omit=dev` → 16 high, all via `braces@3.0.3` (Metro → micromatch) and
  `node-forge@1.4.0` (Expo CLI code signing). `npm view braces version` / `npm view node-forge version` show these
  are the newest releases.
- The A-A11Y-05 and A-RISK-01/03 reproductions now fail as intended (smoke checks "no clock-in on a shift already
  marked no-show", "resolving an already-closed exception says so"; axe clean on Peta 320 px).

## Staging deployment (11 Oct 2026)

- Pre-checks: staging was at `0008`; every server function involved (`validate_shift`, `detect_no_shows`,
  `open_replacement`, `refresh_request_status`, `attendances_flag_exceptions`, `auto_close_attendances`,
  `build_daily_report`) is `security definer` owned by `postgres`, and all 5 pg_cron jobs run as `postgres` — so
  the guards do not apply to the server's own writes.
- Applied the committed file unchanged (`01b36ed`) via the Supabase connector; all 4 triggers present and enabled.
- Live check as `demo.pic` through the `authenticated` role, inside a transaction that was always rolled back:
  shift → `done` refused, `validated_at` refused, SLA move refused, consent on behalf of `demo.spg` refused,
  planned → cancelled still allowed. Afterwards the data was confirmed unchanged (shift still `planned`, SPG consent
  still null).
- Security advisor after the migration: nothing new from `0009`. The 8 "signed-in users can execute SECURITY
  DEFINER" warnings are the app's intended RPCs (each checks the caller's role); one INFO on
  `media_purge_queue` (service-role only by design); leaked password protection (above).
- `src/lib/database.types.ts`: regenerated from staging; the only difference is `is_api_caller` in Functions.

## Status

**VERIFIED WITH LIMITATIONS** — every P1 and P2 finding is fixed, verified by tests and in the browser, and the
database part is live on staging; the limitations are environmental: no native device run, no screen-reader run,
GitHub CI not observable from here.
