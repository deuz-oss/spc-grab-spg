# UI / UX audit

How it was reviewed: the production web export, signed in as each role against a mocked Supabase API with
realistic fixtures (one running request, a no-show with an open replacement, a finished shift awaiting validation,
a draft daily report, two campaigns' KPI), at **320, 390, 768 and 1280 px**. Every screen was screenshotted and
scanned with axe-core 4.10 (WCAG 2.0/2.1/2.2 A + AA rules), checked for horizontal overflow, tap targets under
24 px and unlabeled inputs, and the keyboard focus order was traced from "Hari Ini". Native Android/iOS rendering
was **not** run (no device or emulator in this environment); the same components render there, but native-only
behaviour (camera, background GPS, TalkBack/VoiceOver) is unverified.

Screenshots referenced below are in [`screenshots/`](screenshots/).

## Design direction (kept)

The existing "shift pass" system is coherent and fit for the users, so it was kept rather than redesigned:
ink-navy chrome, one hi-vis amber reserved for "act now" (clock-in, running shift), conventional status colours,
Plus Jakarta Sans with tabular numbers, a 12 px type floor, 48 dp tap targets, status never shown by colour alone.
Tokens live in `src/theme.ts` (colour roles, type scale, spacing, radius, elevation). Changes made here are
corrections inside that system, not a new visual language.

## Route-by-route review

| Screen | Roles | Review | Action |
|---|---|---|---|
| Login | all | Clear single task, brand pane, error under the password field. Inputs had no accessible name. | Names via `Field` (A-A11Y-04); shows why a deactivated account was signed out (A-APP-04) |
| Consent | SPG, coordinator | Plain-language consent with the four facts that matter; agree / leave. | — |
| SPG Hari Ini | SPG, coordinator | Strong: the pass puts times first, one amber action, geofence/late tags with icons. Works at 320 px. Web clock-in was broken. | A-APP-01, A-APP-05 |
| SPG Jadwal | SPG, coordinator | Upcoming + 2-week history, status label + colour bar. | — |
| Ops Hari Ini | PIC, BO, Grab | Exceptions-first triage + validation queue fits "one PIC runs every SPG". Note input unlabeled; bulk validation slow. On desktop the card stretched to 1 248 px. | A-A11Y-04, A-APP-06, A-UX-02 |
| Request list | PIC, BO, Grab | Status, SLA badge, slot fill per request; "Aktif/Semua" filter. | Content width (A-UX-02) |
| Request form | PIC, Grab | Chip pickers work identically on web and phone. Date and coordinate placeholders looked like filled values. | Placeholders "mis. …" (A-UX-04) |
| Request detail | PIC (edit), BO/Grab (read) | Roster per date with photo/grade, replacement SLA, scheduling panel with eligibility reasons up front. Replacement title truncated; SPG picker rows exposed `role=checkbox` without state. | A-UX-03, A-A11Y-03 |
| Peta live | PIC, BO, Grab, coordinator | Map + counts + list; stale state explained in text. **Map tooltips executed HTML from names.** | A-SEC-01 |
| Laporan | PIC, BO, Grab | Daily report cards + CSV exports. Publishing to Grab was one tap with no undo. Exports truncated at 1 000 rows. | A-UX-01, A-APP-02 |
| Data (SPG / Venue / Campaign / Akun staf) | staff | Chip tabs, search, readiness emphasis per SPG. Search input unlabeled. | A-A11Y-04 |
| SPG / account detail | staff | Onboarding checklist, training, consent status, account actions behind a confirm. Downloaded all phone numbers. | A-APP-07 |
| Account / Venue / Campaign forms | staff | Validation messages in Indonesian, map preview for the geofence. Campaign save erased the end date. | A-APP-03 |
| Profil | all | Sync queue, last sync, sign-out warns about unsent data. | — |
| Bottom tab bar | all | Inactive labels ~3:1. On web, hidden tabs were reachable by keyboard. | A-A11Y-01, A-A11Y-02 |

## Major usability issues found and fixed

1. **Web clock-in impossible** (A-APP-01) — the core SPG task failed with a misleading "photo not found" message.
   After: selfie → upload → attendance in one pass (`screenshots/spg-after-clockin.png`).
2. **Irreversible publish without confirmation** (A-UX-01) — now a dialog states the consequence
   ("Grab langsung bisa membacanya… tidak bisa diubah lagi") with Batal / Terbitkan.
3. **Campaign edit silently cleared data** (A-APP-03).
4. **Clock-in could spin forever indoors** (A-APP-05) — bounded location read with a fallback and an actionable message.

## Responsive behaviour

| Viewport | Result |
|---|---|
| 320 px | No horizontal overflow on any screen for any role. Shift pass, KPI counters (56 px step buttons), forms and dialogs fit. |
| 390 px | Same; request detail roster and scheduling panel readable. |
| 768 px | Same layout as phone, wider cards. |
| 1280 px | **Before:** every screen edge to edge (1 248 px cards, 600 px buttons, ~150-character lines) — `screenshots/pic-home-1280-before.png`. **After:** content column max 960 px centred on the page colour; header and tab bar stay full width — `screenshots/pic-home-1280-after.png`. |

Tables: the app has no data grid; lists are cards and rows (roster, requests, exceptions) which suit phone-first
use and wrap without horizontal scrolling. Exports go to CSV for tabular work. No table library was introduced.

## Accessibility (WCAG 2.2 AA, automated + manual)

| Check | Before | After |
|---|---|---|
| axe `color-contrast` (serious) | 5 nodes on **every** screen (inactive tab labels) | 0 |
| axe `aria-hidden-focus` (serious) | every tab screen on web | 0 |
| axe `aria-required-attr` (critical) | request detail (checkbox rows without `aria-checked`) | 0 |
| axe `scrollable-region-focusable` (serious) | Peta 320 px, request detail (read-only roles) | unchanged — deferred (A-A11Y-05) |
| Inputs without accessible name | login, every form field, exception note, search | 0 |
| Selected / disabled / busy / checked state on web | never exposed (react-native-web ignores `accessibilityState`) | exposed via `aria-pressed` / `aria-disabled` / `aria-busy` / `aria-checked` |
| Keyboard order from "Hari Ini" (PIC) | note → Selesai → Kecualikan → Validasi → **hidden Request tab** (Request baru, Aktif, Semua) → map iframe → **hidden Laporan buttons** | note → Selesai → Kecualikan → Validasi → tab bar |
| Focus visible | browser focus ring on every stop | unchanged |
| Tap targets < 24 px | none | none |
| Status by colour alone | none found (labels/icons everywhere) | — |
| Reduced motion | dialog fade honours the OS setting | — |

A passing automated scan is not a compliance claim: screen-reader announcements on Android TalkBack and iOS
VoiceOver were not tested, and the map content itself is visual (the list under it carries the same information
as text).

## Before / after screenshots

| | Before | After |
|---|---|---|
| PIC home, 1280 px | `pic-home-1280-before.png` | `pic-home-1280-after.png` |
| Live map tooltip with a hostile name | `pic-map-tooltips-before.png` | `pic-map-tooltips-after.png` |
| SPG web clock-in | dialog "Foto tidak ditemukan di HP" (see REMEDIATION_LOG) | `spg-after-clockin.png` |
| SPG pass, 320 px | — | `spg-home-320.png` |
| Request detail, 390 px | `pic-request-detail-390-before.png` | `pic-request-detail-390-after.png` |

## Outstanding UX risks

- Native rendering, camera capture and TalkBack/VoiceOver not exercised (no device here) — do one pass on the pilot phones.
- Dates are typed (`TTTT-BB-HH`) rather than picked; validated and consistent, but slower on a phone than a picker.
- Long lists (roster, accounts) are not virtualised; fine for the 5-SPG pilot, revisit past a few hundred rows.
- `scrollable-region-focusable` (A-A11Y-05).
- App icons are still the reference repo's placeholders (README open item).
