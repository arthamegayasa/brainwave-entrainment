---
phase: quick-260714-p5o
plan: 01
subsystem: ui
tags: [css, color-scheme, optgroup, web-audio, vitest, node-web-audio-api, spectral-tests]

# Dependency graph
requires:
  - phase: quick-260707-a47
    provides: Builder UI (Layers panel, .select styling in App.css)
provides:
  - Dark-theme select popup styling for all .select controls app-wide (color-scheme + solid option/optgroup colors)
  - Grouped layer-type dropdown (Entrainment / Tone / Ambience) with byte-identical option values
  - Tuned DEMO.ambient synthesis constants (ocean swell 6.7 s, wind gust 4 s, sharper rain hiss)
  - Spectral signature regression tests pinning every AmbientKind to its sonic identity
affects: [builder, audio-engine, m003]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Select popup styling: color-scheme: dark on the control + SOLID (non-alpha) option/optgroup backgrounds"
    - "Offline-render channel data must be COPIED (.slice()) when retained across renders — node-web-audio-api getChannelData returns a native-memory view"

key-files:
  created: []
  modified:
    - src/App.css
    - src/ui/Builder.tsx
    - src/audio/constants.ts
    - tests/audio/ambient.test.ts

key-decisions:
  - "Ocean tuned to baseGain 0.55 / lfoDepth 0.45 (not plan's 0.65/0.5 starting point) so max gain stays at 1.0 — avoids clipping headroom loss while deepening the swell"
  - "Signature tests measure over 20 s windows; all passed numerically against old constants, confirming the defect was perceptual tempo (10 s swell cycle) not absent modulation"
  - "Hardened both render helpers with .slice() copies after isolating a native use-after-free segfault in vitest forks"

patterns-established:
  - "Spectral regression testing: ZCR ordering + window-RMS swell ratio + per-window ZCR coefficient-of-variation pin ambience label identity"

requirements-completed: [QUICK-260714-P5O]

# Metrics
duration: 14min
completed: 2026-07-14
---

# Quick Task 260714-p5o: Fix Builder Layers Panel Summary

**Dark readable select popups via color-scheme + solid option colors, Entrainment/Tone/Ambience optgroups, and ambience synthesis retuned (6.7 s ocean swell, 4 s wind gusts, brighter rain) pinned by spectral signature tests**

## Performance

- **Duration:** ~14 min (18:15–18:29 local)
- **Started:** 2026-07-14T10:15:00Z
- **Completed:** 2026-07-14T10:28:57Z
- **Tasks:** 3 (task 3 TDD: test + feat commits)
- **Files modified:** 4

## Accomplishments

- Every `.select` popup app-wide (Builder ×3, Dashboard ×4, publish-actions, bank-download-row) now renders a dark popup with readable light text: `color-scheme: dark` declared on the control itself plus solid `#131722` option/optgroup backgrounds (alpha backgrounds were compositing to white in Chromium popups). Closed-state translucent field look unchanged.
- Layer-type dropdown grouped into Entrainment (Binaural/Isochronic/Monaural), Tone (Pure Tone), Ambience (Rain/Ocean/Wind/Brown Noise) via `<optgroup>` — all 8 option value strings byte-identical, saved custom presets load unchanged.
- Ambience sounds now perceptually distinct and pinned by automated spectral tests. Measured margins with tuned constants: ocean window-RMS ratio 7.9 (threshold ≥1.5), brown 1.12 (≤1.2), wind ZCR CV 0.169 (>0.1), rain 0.002 (<0.05), ZCR ordering rain 10952 > wind 5841 > ocean 438, ocean maxAbs 0.726 (no clipping).

## Task Commits

Each task was committed atomically:

1. **Task 1: Dark-theme select popup fix** - `27ff9d7` (fix)
2. **Task 2: Grouped layer-type dropdown** - `f9d4b6b` (feat)
3. **Task 3 RED: Spectral signature tests** - `3842dcd` (test)
4. **Task 3 GREEN: Tune DEMO.ambient constants** - `cd15a0d` (feat)

## Files Created/Modified

- `src/App.css` - `.select` color-scheme + solid dark option/optgroup popup rules (labels dimmed, non-italic; nested options full ink)
- `src/ui/Builder.tsx` - `LAYER_TYPE_GROUPS` constant + optgroup rendering; unused flat `LAYER_TYPES` removed
- `src/audio/constants.ts` - `DEMO.ambient` tuned: ocean lfoHz 0.15 / lfoDepth 0.45 / baseGain 0.55, wind lfoHz 0.25, rain highpassHz 1200; comments updated to reference the pinning tests
- `tests/audio/ambient.test.ts` - New "Ambience spectral signatures" describe block (ZCR ordering, ocean-vs-brown swell envelope, wind-vs-rain gust movement); render helpers hardened to copy channel data

## Decisions Made

- **Ocean gain shape:** used baseGain 0.55 / lfoDepth 0.45 instead of the plan's suggested 0.65 / 0.5 starting point — keeps max instantaneous gain at 1.0 (the plan's values would reach 1.15 and risk failing the existing no-clip assertion) while still satisfying baseGain − lfoDepth > 0 and producing a much deeper swell (RMS ratio 3.4 → 7.9).
- **Thresholds kept as planned** (1.5 / 1.2 / 0.1 / 0.05): three consecutive full-suite runs green; margins are wide enough that random noise buffers don't approach the limits.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] vitest worker segfault from retained native channel-data views**
- **Found during:** Task 3 (RED phase — "ocean swells" test crashed the vitest fork with "Worker exited unexpectedly")
- **Issue:** `renderAmbientLong` returned `buffer.getChannelData(0).subarray(...)` — in node-web-audio-api, getChannelData exposes a view over native memory. Retaining that view across a second 20 s offline render let GC free the first AudioBuffer's backing store, and reading the dangling view segfaulted the worker (confirmed by A/B probe: subarray crashes, slice passes).
- **Fix:** Copy channel data with `.slice()` in `renderAmbientLong`; hardened the pre-existing `renderAmbient` helper the same way (the existing "rain brighter than ocean" test retains data across renders with the identical latent hazard).
- **Files modified:** tests/audio/ambient.test.ts
- **Verification:** Full suite 110/110 green across 3 consecutive runs
- **Committed in:** 3842dcd (Task 3 test commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Test-infrastructure fix required to make the planned long renders viable in vitest forks. No scope creep; no engine code affected.

## Issues Encountered

- **RED phase produced no failing assertions:** all new signature tests passed numerically against the OLD constants — over a 20 s analysis window the 10 s ocean swell registers as a large RMS ratio (3.4). Investigated per TDD protocol and confirmed this matches the plan's own audit: the defect is perceptual tempo (swell too slow to notice in a short audition), not absent modulation. Proceeded with the planned tuning; tests now guard label identity (ordering, swell existence, gust movement) against future regressions.

## TDD Gate Compliance

- RED gate: `3842dcd` (test) — committed first, with the no-failing-assertion investigation documented above.
- GREEN gate: `cd15a0d` (feat) — only `DEMO.ambient` constants changed; suite green.
- REFACTOR gate: not needed.

## User Setup Required

None - no external service configuration required.

## Human Verification Pending

- Open Builder in Chrome (Windows) and Firefox → layer-type select popup: dark background, readable light text, three labeled groups.
- Preview each ambience layer ~10 s: Rain = steady bright hiss, Ocean = low rumble with clearly audible wave swells (~7 s apart), Wind = mid whoosh with moving gusts (~4 s), Brown Noise = static deep rumble.

## Next Phase Readiness

- Builder Layers panel is visually and sonically consistent with labels; spectral tests protect future DEMO.ambient tuning.
- No blockers.

## Self-Check: PASSED

All 4 modified files present; all 4 task commits (27ff9d7, f9d4b6b, 3842dcd, cd15a0d) verified in git log; SUMMARY.md left uncommitted for the orchestrator's docs commit.

---
*Phase: quick-260714-p5o*
*Completed: 2026-07-14*
