---
phase: quick-260714-dc3
plan: 01
subsystem: ui
tags: [react, supabase, magic-link, account-sheet, localstorage]

# Dependency graph
requires:
  - phase: quick-260714-a8a
    provides: patient-side clinician linking (getMyClinician/unlinkMyClinician), 3-tier Upgrade page, useEntitlement role/plan state
provides:
  - AccountSheet overlay (src/ui/Account.tsx) — single identity surface: magic-link sign-in, profile with plan/role chips, subscription + Manage plan, my-clinician status (role user), settings resets, sign out
  - Circular topbar account button (person icon signed out, email initial signed in)
  - resetProgress()/resetPrefs() state helpers (never throw, remove localStorage keys)
  - Premium page as pure checkout surface (no email input, no Sign out links)
  - Library signed-out note routes to the Account sheet instead of the Premium page
affects: [dashboard, upgrade, library, any future account/profile work]

# Tech tracking
tech-stack:
  added: []
  patterns: [single identity surface — sign-in/sign-out live ONLY in AccountSheet, sheet-backdrop click-to-close reuse, .account-* CSS namespace]

key-files:
  created: [src/ui/Account.tsx]
  modified: [src/App.tsx, src/ui/Upgrade.tsx, src/ui/Library.tsx, src/state/progress.ts, src/state/prefs.ts, src/App.css, tests/progress.test.ts]

key-decisions:
  - "Settings resets render in both the not-configured and signed-in branches (never in the signed-out branch), so offline builds still get resets"
  - "Flash notes in the sheet are persistent-until-next-action (plan allowed either persistent or timed)"
  - "Plan/role chips are non-interactive <span className=\"chip small\"> elements reusing existing chip styling"
  - "ent.email.charAt(0) used over ent.email[0] for index-safety regardless of compiler flags"

patterns-established:
  - "Identity surface: all sign-in/sign-out UI lives in AccountSheet; feature pages receive an onSignIn callback that opens it"
  - "Danger actions: .chip.danger subtle red styling + window.confirm before destructive resets/disconnect"

requirements-completed: [D-01, D-02, D-03, D-04, D-05, D-06, D-07, D-08]

# Metrics
duration: 8min
completed: 2026-07-14
---

# Quick Task 260714-dc3: Account Menu in Header Summary

**Circular topbar account button opening an AccountSheet that owns magic-link sign-in (moved off the Premium page), profile/plan chips, Manage plan, clinician link status, localStorage resets, and sign out**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-07-14T01:43:10Z
- **Completed:** 2026-07-14T01:50:44Z
- **Tasks:** 2 (Task 1 TDD: RED + GREEN commits)
- **Files modified:** 8 (1 created, 7 modified)

## Accomplishments
- New `src/ui/Account.tsx` (270 lines): sheet-backdrop overlay with four states — not-configured note, loading, signed-out magic-link form ("Check your email for a sign-in link."), and signed-in sections in order: Profile (avatar initial + email + plan/role chips), Subscription ("Active until …" / Free line + Manage plan), My clinician (role user only: connected + Disconnect with confirm, or Open Library pointer), Settings (both resets with confirm + flash note), Sign out
- `resetProgress()`/`resetPrefs()` exported from state modules — remove `serenade.progress.v1`/`serenade.prefs.v1` via the existing `storage()` guard, never throw; 4 new unit tests (21 total in progress.test.ts)
- Premium page is now a pure checkout surface: zero email inputs, zero Sign out links; signed-out paid cards show a single "Sign in to subscribe" button opening the sheet
- Library's signed-out "Made for you" note gained a "Sign in" chip opening the sheet; `onUpgrade` prop fully removed; the invite-code "My clinician" block untouched
- App topbar: `.account-btn` circle after the nav — inline SVG person icon signed out, uppercase email initial signed in; flex `space-between` places it right of the nav

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): failing tests for resetProgress/resetPrefs** - `87defbf` (test)
2. **Task 1 (GREEN): reset helpers + AccountSheet + account CSS** - `8f0051e` (feat)
3. **Task 2: topbar account button + Premium/Library rewire** - `0c4f081` (feat)

_Note: Task 1 was TDD (test → feat); no refactor commit needed._

## Files Created/Modified
- `src/ui/Account.tsx` - AccountSheet overlay, the single identity surface (created)
- `src/state/progress.ts` - `resetProgress()` appended
- `src/state/prefs.ts` - `resetPrefs()` appended
- `tests/progress.test.ts` - new `resetProgress / resetPrefs` describe block (4 tests)
- `src/App.css` - appended `.account-btn/.account-section/.account-row/.account-avatar/.account-email/.account-copy/.account-note/.chip.danger` block (append-only, no existing rules edited)
- `src/App.tsx` - AccountSheet import + `accountOpen` state + topbar button + sheet render; `onSignIn` passed to Upgrade and all 3 Library sites; Home's `onUpgrade={goUpgrade}` untouched
- `src/ui/Upgrade.tsx` - `onSignIn` prop threaded to PlanCheckout; email form, `email` state, `signInWithEmail`/`signOut` imports, and both Sign out link-btns removed
- `src/ui/Library.tsx` - `onUpgrade` prop replaced by `onSignIn`; signed-out note now "Sign in to see sessions made for you." + Sign in chip

## Decisions Made
- Flash notes persist until the next action (plan explicitly allowed either persistent or ~2.5s timed) — simpler, no timer cleanup needed in an ephemeral sheet
- `.chip.danger` chosen over `.pill-btn.danger` for reset/disconnect: matches the compact `chip small` actions already used in Library
- `.account-note` helper class left-aligns `.plan-note` (which centers text for plan cards) inside the sheet — new class, no existing rule edited

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None — every section is wired to live data (`useEntitlement`, `getMyClinician`, localStorage state helpers).

## Issues Encountered

None. The known flaky test (tests/audio/builder.test.ts) did not fail this run — full suite 104/104 green.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Account sheet is the standard identity entry point; future account features (delete account, notification prefs) have a home
- Dashboard task (running after this one) is unaffected: `src/ui/Dashboard.tsx`, `src/audio/**`, and `supabase/**` untouched
- Verification gates all green: `npm run build` ✓, `npm test` 104/104 ✓, grep gates (AccountSheet×2 in App.tsx, onSignIn×4 in App.tsx, signInWithEmail|signOut = 0 in Upgrade.tsx, onUpgrade = 0 in Library.tsx, account-btn present in App.css) ✓

## Self-Check: PASSED

- All 9 claimed files exist on disk (1 created, 7 modified, 1 summary)
- All 3 task commits present in git log: `87defbf`, `8f0051e`, `0c4f081`
- `src/ui/Account.tsx` = 275 lines (≥ 150 required by must_haves)
- No file deletions across task commits

---
*Phase: quick-260714-dc3*
*Completed: 2026-07-14*
