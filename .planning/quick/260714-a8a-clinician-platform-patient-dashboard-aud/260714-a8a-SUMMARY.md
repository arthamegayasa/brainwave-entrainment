---
phase: quick-260714-a8a
plan: 01
subsystem: clinician-platform
tags: [supabase, rls, midtrans, react, invite-codes, pricing, rpc]

# Dependency graph
requires:
  - phase: quick-260707-a47
    provides: profiles/roles schema, custom_audios + audio_assignments, Midtrans billing (create-transaction, midtrans-webhook), admin publish panel
provides:
  - 3-role model (user/clinician/admin) with is_clinician() + widened role check
  - Invite-code patient linking (patient_links, invite_codes, redeem_invite_code/get_my_clinician definer RPCs)
  - Per-patient built-in preset curation (template_visibility → Home grid/picker/recommendation filtering)
  - Clinician Audio Bank (custom_audios category/notes, filterable Dashboard bank tab)
  - Clinician Dashboard UI (Patients + Audio Bank tabs)
  - 3-tier Upgrade page (Free / Premium / Clinician) with plan-aware Midtrans checkout
  - Webhook clinician role promotion/demotion with 3-part orderId back-compat
affects: [billing, library, studio, upgrade, home, supabase-schema]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SECURITY DEFINER RPC as the only insert path for patient_links (no client insert policy)"
    - "Two-step profiles join for auth.users FKs (PostgREST embedded joins unavailable)"
    - "sanitizeSession gate on every cloud spec before it reaches the audio engine"
    - "Role-gated (not TierFeatures-gated) clinician surface"

key-files:
  created:
    - supabase/migrations/0005_clinician_platform.sql
    - src/lib/clinician.ts
    - src/lib/patientLink.ts
    - src/ui/Dashboard.tsx
    - tests/bands.test.ts
    - tests/pricing.test.ts
  modified:
    - supabase/functions/create-transaction/index.ts
    - supabase/functions/midtrans-webhook/index.ts
    - src/state/tier.ts
    - src/lib/payments.ts
    - src/lib/roles.ts
    - src/lib/useEntitlement.ts
    - src/lib/audioLibrary.ts
    - src/ui/bands.ts
    - src/ui/Builder.tsx
    - src/ui/Library.tsx
    - src/ui/Home.tsx
    - src/ui/Upgrade.tsx
    - src/App.tsx
    - src/App.css

key-decisions:
  - "Assigned-count per patient via one bulk audio_assignments select grouped in memory (listAssignmentCounts) instead of N per-patient queries"
  - "Self-link guard in redeem_invite_code returns the uniform invalid_code error (no code-ownership oracle)"
  - "Clinician card shows a minimal 'available once payments are configured' note in unconfigured builds (LocalActivate stays premium-only)"
  - "listMyPatients adds an explicit .eq(clinician_id, uid) filter so a clinician who is also someone's patient never sees their own patient-link row"

patterns-established:
  - "Definer RPC pattern: revoke from public+anon, grant to authenticated, uniform jsonb error shapes"
  - "AUDIO_CATEGORIES as single const source for Dashboard + Builder pickers"

requirements-completed: [D-01, D-02, D-03, D-04, D-05, D-06, D-07]

# Metrics
duration: 22min
completed: 2026-07-13
---

# Quick Task 260714-a8a: Clinician Platform Summary

**Serenade clinician platform in one pass: 3-role model, invite-code patient linking, per-patient preset curation, filterable Audio Bank, clinician Dashboard, and a 3-tier Upgrade page with plan-aware Midtrans checkout — back-compatible with live premium billing.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-07-13T23:31:43Z
- **Completed:** 2026-07-13T23:54:01Z
- **Tasks:** 3
- **Files modified:** 20 (6 created, 14 modified)

## Accomplishments

- Migration 0005 (305 lines): role check widened to user/clinician/admin, is_clinician() definer fn, patient_links (unique patient → one clinician max), invite_codes (8-char single-use, 30-day expiry), template_visibility (row = hidden preset), custom_audios category/notes, redeem_invite_code + get_my_clinician definer RPCs, all admin-era policies replaced with clinician-scoped ones, anon revokes (0004 pattern).
- Billing: create-transaction takes `{ plan, period }` with a premium×clinician price matrix (plan defaults to premium for old clients); webhook settles 4-part orderIds plan-aware, treats legacy 3-part orderIds as premium, promotes role user→clinician on paid clinician orders and demotes clinician→user on failed ones (admins never touched).
- Clinician client surface: clinician.ts (patients via two-step profiles join, invite codes, sanitizeSession-guarded bank with band/targetHz/layerCount, visibility, assignment incl. assign-to-all), Dashboard with Patients tab (invite codes copy/revoke, per-patient preset checkboxes where CHECKED=VISIBLE, assignment management, 30-patient soft cap) and Audio Bank tab (search × category × band filters, card grid with Assign…/Edit/Delete).
- Patient client surface: patientLink.ts (redeem, my-clinician via definer RPC, unlink, hidden ids that return [] standalone), Library "My clinician" connect/disconnect block with friendly error copy and post-redeem assigned-audio refresh, Home filtering hidden presets from grid/goal-picker/recommendation with safe fallbacks.
- 3-tier Upgrade: page-level billing toggle driving both paid cards, clinician card with Rp2,988,000 anchor strike beside Rp1,990,000/year and Rp165,833/month subprice, PlanCheckout('premium'|'clinician') sharing the magic-link sign-in branch; premium checkout flow, early-access banner, and stakes block untouched.
- Tests: bands.test.ts (bandForHz boundary mapping) + pricing.test.ts (clinician invariants, premium regression guard, TierFeatures-not-wired guard). `npm run build` + `npm test` green after every task (92 tests).

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend — migration 0005, edge functions, pricing, role plumbing, bandForHz** - `8b08704` (feat)
2. **Task 2: Clinician side — clinician lib, Dashboard, Builder bank publish, nav wiring** - `6844e95` (feat)
3. **Task 3: Patient side — clinician linking, preset hiding, 3-tier Upgrade** - `3dccfc7` (feat)

## Files Created/Modified

- `supabase/migrations/0005_clinician_platform.sql` - Full clinician schema/RLS/RPC layer (NOT applied — orchestrator applies via Supabase MCP)
- `supabase/functions/create-transaction/index.ts` - Plan-aware Snap checkout (NOT deployed — orchestrator deploys)
- `supabase/functions/midtrans-webhook/index.ts` - Plan-aware settle + role promotion/demotion, 3-part back-compat (NOT deployed)
- `src/lib/clinician.ts` - Clinician data layer (patients, codes, bank, visibility, assignment, AUDIO_CATEGORIES)
- `src/lib/patientLink.ts` - Patient-side linking (redeem, my clinician, unlink, hidden preset ids)
- `src/ui/Dashboard.tsx` - Clinician home: Patients tab + Audio Bank tab
- `src/ui/Builder.tsx` - Publish panel clinician-gated with category/notes + "Save to Audio Bank"; template button admin-only; listAllUsers removed
- `src/ui/Library.tsx` - My clinician connect/disconnect block, loadCloud refactor
- `src/ui/Home.tsx` - Hidden preset filtering (grid, goal picker, recommendation)
- `src/ui/Upgrade.tsx` - 3-tier redesign with page-level toggle + PlanCheckout
- `src/ui/bands.ts` - bandForHz(hz) band mapping
- `src/state/tier.ts` - PRICING.IDR.clinician block (premium numbers byte-identical)
- `src/lib/{payments,roles,useEntitlement}.ts` - clinician tier/role/isClinician plumbing
- `src/lib/audioLibrary.ts` - publishAudio/CloudAudio carry category + notes
- `src/App.tsx` - dashboard view, clinician nav (Dashboard + Studio), Library fallback
- `src/App.css` - dashboard tabs, patient detail, bank grid, my-clinician block, 3-column plans
- `tests/bands.test.ts`, `tests/pricing.test.ts` - new invariant suites

## Decisions Made

- Assigned-count per patient derived from ONE bulk `audio_assignments` select grouped in memory (`listAssignmentCounts`) — the plan's "lightweight count query" discretionary option.
- Self-link guard in redeem_invite_code returns the uniform `invalid_code` shape (no oracle about code ownership), per the plan's discretion note.
- `listMyPatients` filters `.eq("clinician_id", uid)` explicitly so a clinician who is themselves another clinician's patient never sees their own patient-link row in their patient list.
- Clinician card in unconfigured builds shows a one-line "available once payments are configured" note instead of a dead button; LocalActivate stays on the Premium card only (minimal copy per plan discretion).
- Builder publish section retitled "Audio Bank" to match the new primary action.

## Deviations from Plan

None - plan executed exactly as written (the items above are within the plan's explicit discretion notes).

## Issues Encountered

- **Pre-existing flaky test (out of scope, NOT fixed):** `tests/audio/builder.test.ts > plays multiple layers simultaneously with per-layer methods` fails intermittently (~50% of runs) on code untouched by this task (last modified commit `b98d282`). Logged to `deferred-items.md` in this directory; final verification runs were green (92/92).

## Known Stubs

None — every new UI element is wired to a real data source. `getMyHiddenPresetIds()` returning `[]` when Supabase is unconfigured/signed-out is intentional design (zero behavior change in standalone builds), not a stub.

## User Setup Required

None - Supabase + Midtrans credentials already configured from quick-260707-a47. Post-execution the ORCHESTRATOR must: apply migration 0005 via Supabase MCP, deploy both edge functions, push to GitHub (Vercel auto-deploys).

## Next Phase Readiness

- Clinician journey complete in code: buy clinician plan → webhook promotes role → Dashboard/Studio in nav → invite code → patient redeems in Library → curation + assignment reflected in patient's Home/Library.
- Blockers: none for code. Deployment gates (migration apply + edge function deploys + push) are orchestrator-owned.

## Self-Check: PASSED

All created files verified on disk; commits 8b08704, 6844e95, 3dccfc7 verified in git log; final `npm run build` + `npm test` green (92/92).

---
*Phase: quick-260714-a8a*
*Completed: 2026-07-13*
