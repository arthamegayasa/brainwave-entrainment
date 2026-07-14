---
phase: quick-260714-df1
plan: 01
subsystem: audio
tags: [mp3, lamejs, offline-audio-context, web-audio, react, export]

# Dependency graph
requires:
  - phase: quick-260714-a8a
    provides: Clinician Dashboard with Audio Bank tab (BankTab/BankCard, listBank + sanitizeSession)
provides:
  - src/audio/export.ts engine module (renderSession, encodeMp3, exportSessionMp3) — pure TS, zero React
  - BankCard "Download…" panel: 5-60 min length select, 320 kbps stereo MP3 download with live phase feedback
  - Single-flight export enforcement across all bank cards (lifted state in BankTab)
affects: [studio, library, clinician-dashboard, m003-builder]

# Tech tracking
tech-stack:
  added: ["@breezystack/lamejs ^1.2.7 (in-browser MP3 encoder, registry-verified, lockfile-pinned)"]
  patterns:
    - Offline render via injectable OfflineAudioContext factory (tests inject node-web-audio-api)
    - Chunked Float32→Int16 encode with event-loop yield every 200 blocks + progress callback

key-files:
  created:
    - src/audio/export.ts
    - tests/audio/export.test.ts
  modified:
    - src/ui/Dashboard.tsx
    - src/App.css
    - package.json
    - package-lock.json

key-decisions:
  - "Encoder always runs 2-channel: mono buffers duplicate channel 0 (binaural content needs stereo)"
  - "exportBusy lifted to BankTab (not module flag) so sibling cards re-render disabled during a run"
  - "encodeBuffer chunks typed Uint8Array per @breezystack/lamejs type.d.ts (plan said Int8Array; actual API returns Uint8Array)"

patterns-established:
  - "Injectable context factory: renderSession(spec, min, createContext?) keeps engine testable without DOM"
  - "App.css cross-task coordination: feature styles appended at EOF under a task-tagged section comment"

requirements-completed: [QUICK-260714-DF1]

# Metrics
duration: 10min
completed: 2026-07-14
---

# Quick Task 260714-df1: Audio Bank MP3 Export Summary

**Offline-rendered 320 kbps stereo MP3 export for every Audio Bank entry — BuilderEngine driven inside an OfflineAudioContext, encoded in-browser via @breezystack/lamejs, downloaded from a per-card panel with live Rendering/Encoding feedback**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-07-14T01:54:17Z
- **Completed:** 2026-07-14T02:04:30Z
- **Tasks:** 2 (Task 1 TDD)
- **Files modified:** 6

## Accomplishments

- `src/audio/export.ts` (109 lines, zero React imports — ENG-07): `renderSession` reuses the exact live BuilderEngine (ramp curve, layer mix, fades, safety limiter carry over), `encodeMp3` converts Float32→Int16 in 1152-sample blocks with a `setTimeout(0)` yield every 200 blocks so the page stays responsive, `exportSessionMp3` chains both with phase callbacks.
- BankCard gained a "Download…" chip + panel: length select 5/10/15/30/45/60 min (default 15), "320 kbps MP3 · stereo" note, device warning at 45/60 min, phase-labeled button (Rendering… / Encoding N%), Library-pattern blob download with sanitized filename.
- Single-flight: `exportBusy` lives in BankTab and disables every card's export controls while any export runs; failure flashes "Export failed — try a shorter length." and `finally` restores the UI.
- 3 new offline-render/encode tests (frame-sync/ID3 byte validation, mono→stereo duplication) — suite runs in ~1.1 s.

## Task Commits

1. **Task 1 (RED): failing export tests** - `6af1e78` (test)
2. **Task 1 (GREEN): export engine + dependency** - `d8cf718` (feat)
3. **Task 2: BankCard Download panel + styles** - `41cb681` (feat)

_No REFACTOR commit — GREEN implementation needed no cleanup._

## Files Created/Modified

- `src/audio/export.ts` - renderSession / encodeMp3 / exportSessionMp3 (pure TS engine layer)
- `tests/audio/export.test.ts` - 3 tests: non-silent stereo render, MP3 sync-byte validation, mono→stereo encode
- `src/ui/Dashboard.tsx` - BankTab lifted exportBusy state; BankCard Download… chip, panel, handler
- `src/App.css` - appended `.bank-download`, `.bank-download-row`, `.bank-download-note`, `.export-warning` (pure EOF append)
- `package.json` / `package-lock.json` - @breezystack/lamejs ^1.2.7

## Decisions Made

- Chunks from `encodeBuffer`/`flush` typed as `Uint8Array` (the package's `type.d.ts` declares Uint8Array; the plan's interface sketch said Int8Array). Behavior identical for Blob assembly.
- `onProgress(100)` emitted once after the block loop so short encodes still report completion.
- Warning condition implemented as `dlMin >= 45` (equivalent to "45 or 60" given the fixed option list).

## Deviations from Plan

None - plan executed exactly as written. (Supply-chain gate T-df1-SC passed: registry returned 200 for @breezystack/lamejs, latest 1.2.7, before install.)

## Threat Model Compliance

- **T-df1-SC (mitigate):** package existence verified against registry.npmjs.org pre-install; lockfile committed pinning 1.2.7.
- **T-df1-01 (accept):** export consumes only `BankAudio.spec`, which listBank() has already passed through sanitizeSession.
- **T-df1-02 (accept):** 45/60-min warning copy shipped; failure path recovers via flash + finally reset.

## Known Stubs

None.

## Issues Encountered

None. Pre-existing flaky test (builder.test.ts "plays multiple layers simultaneously") passed in the full-suite run — no isolation re-run needed.

## User Setup Required

None - no external service configuration required.

## Verification Results

- `npx vitest run tests/audio/export.test.ts` → 3 passed in 1.12 s (< 10 s budget)
- `npm run build` → tsc + vite green (PWA precache generated)
- `npm test` → 16 files / 107 tests passed
- `git diff --stat 6af1e78~1 HEAD` → exactly the 6 planned files, 0 deletions
- `grep -c 'from "react"' src/audio/export.ts` → 0

## Next Phase Readiness

- Export module is engine-layer pure and reusable for M003 builder export (Studio could offer the same download).
- Possible future upgrade: move encode into a Web Worker for very long exports (current chunked-yield approach keeps the main thread responsive but still occupies it).

## Self-Check: PASSED

- src/audio/export.ts, tests/audio/export.test.ts, SUMMARY.md — all exist
- Commits 6af1e78, d8cf718, 41cb681 — all present in git log

---
*Phase: quick-260714-df1*
*Completed: 2026-07-14*
