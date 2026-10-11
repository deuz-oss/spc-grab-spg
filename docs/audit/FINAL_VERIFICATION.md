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
| A-RISK-06 | — | Migration `0009_audit_hardening.sql` is not applied to staging (`irsgynzhdlwnbvcjynqf`). | Apply in the Supabase SQL Editor (it contains no DELETE, so the MCP connector can apply it too), then rerun the staging role checks; regenerate `src/lib/database.types.ts` (adds `is_api_caller` to Functions). Rollback: `drop trigger shifts_guard_api on public.shifts; drop trigger requests_guard_api on public.requests; drop trigger attendance_media_guard_api on public.attendance_media; drop trigger profiles_guard_consent on public.profiles;` and re-create `build_daily_report` from `0001`. |
| A-A11Y-05 | P3 | `scrollable-region-focusable` | Make the screen scroll container focusable on web in the UI kit. |
| A-OPS-03 | P3 | npm advisories in Expo/Metro tooling | Take the next Expo 57 patch; do not `npm audit fix --force` (downgrades Expo). |
| A-RISK-01 | P3 | Late SPG can clock in after the no-show job; the shift stays `no_show`. | Product decision: reopen the shift, or refuse the clock-in with a clear message. |
| A-RISK-02 | P3 | Duplicate `(shift, field)` KPI from a second device is reported as sent. | Distinguish same-id duplicates from field conflicts in `settle` for `submitKpi`. |
| A-RISK-03 | P3 | `resolve_exception` succeeds silently on an already-closed exception. | Raise "sudah ditutup" so the second PIC is told. |
| — | — | Native Android/iOS, camera capture, background GPS, push — not exercised here (no device). | Pilot-phone pass per README phase "Android dev build on a real phone". |

### Reproduction for unresolved items
- **A-A11Y-05:** web build → sign in as Grab → Peta at 320 px width → run axe → `scrollable-region-focusable`.
- **A-RISK-01:** SQL: shift starting 40 min ago, run `select public.detect_no_shows()`, then insert an attendance
  as the SPG → accepted, shift status stays `no_show`.
- **A-RISK-03:** two sessions as PIC, both `select public.resolve_exception(<id>, 'resolved', 'x')` → both succeed,
  the second changes nothing.

## Status

**VERIFIED WITH LIMITATIONS** — every P1 and P2 finding is fixed and verified by tests and in the browser; the
limitations are environmental: no native device run, no screen-reader run, GitHub CI not observable from here,
and migration `0009` awaits application to staging.
