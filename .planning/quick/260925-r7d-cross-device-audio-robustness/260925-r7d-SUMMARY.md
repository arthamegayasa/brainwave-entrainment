---
phase: quick-260925-r7d
plan: 01
subsystem: audio
tags: [web-audio, ios, audio-session, sample-rate, lifecycle, vitest, node-web-audio-api]

requires:
  - phase: quick-260714-p5o
    provides: Tuned DEMO.ambient constants + spectral signature tests (reference 44.1 kHz)
provides:
  - One shared AudioContext for preset and custom audio (src/ui/audioContext.ts)
  - iOS silent-switch-proof playback audio session (Safari 16.4+)
  - Interruption recovery with a "Resume audio" banner; idle suspension
  - Sample-rate-invariant ambient noise pinned by a multi-rate test
affects: [audio-engine, player, builder, library]

tech-stack:
  added: []
  patterns:
    - "acquireAudio(owner) synchronously inside the gesture; never await resume()"
    - "Build node graphs, then read ctx.currentTime, then start"
    - "Per-sample DSP constants derived from ctx.sampleRate against NOISE_REFERENCE_RATE"

key-files:
  created:
    - src/ui/audioContext.ts
  modified:
    - src/audio/noise.ts
    - src/audio/session.ts
    - src/audio/builder.ts
    - src/ui/useSession.ts
    - src/ui/builderEngine.ts
    - src/ui/Builder.tsx
    - src/ui/Library.tsx
    - src/App.tsx
    - src/App.css
    - tests/audio/ambient.test.ts

key-decisions:
  - "ADR-013: one shared AudioContext owned by the UI glue layer; engines stay context-agnostic (ENG-07)"
  - "16 kHz excluded from the multi-rate test: rain's 7 kHz lowpass warps ~1 dB near Nyquist, a physical limit"
  - "Speaker-mode carrier audibility (174 Hz on phone speakers) left as a product decision, not changed"

requirements-completed: [QUICK-260925-R7D]

duration: ~70min
completed: 2026-09-25
---

# Quick Task 260925-r7d: Cross-Device Audio Robustness Summary

**One shared AudioContext with an iOS playback session, interruption recovery and idle suspension; ambience synthesized identically at every device sample rate; click-free scheduling on slow devices.**

## Accomplishments

- **Sample-rate-invariant ambience** (`noise.ts`): brown-noise leak `a = 1.02^(−44100/fs)` keeps the ~139 Hz corner fixed; white noise × `sqrt(fs/44100)` keeps power per Hz fixed. Output at 44.1 kHz is unchanged. Measured band deltas vs 44.1 kHz after the fix: ≤0.65 dB at 22.05/48/96/192 kHz (before: 2.4–3.4 dB).
- **Shared context** (`src/ui/audioContext.ts`): `latencyHint: "playback"`, `navigator.audioSession.type = "playback"`, non-blocking `resume()`, auto-resume on `statechange`/`visibilitychange`/`pageshow`/`focus`/any gesture, `isAudioBlocked()` + `subscribeAudio()` for `useSyncExternalStore`, suspend 1.5 s after the last owner releases.
- **Resume banner** (`App.tsx`, `App.css`): sticky, opaque "Resume audio" alert, shown only when the device holds a pause after playback ran, or a fresh start is still not running after a 1.5 s grace.
- **Synchronous start paths**: `useSession.start`, `ensureBuilder`, Studio `handlePlay`, Library `play`/`playFrom`, `App.handleStart`.
- **Build-then-timestamp** in `SessionEngine.start/setAmbient` and `BuilderEngine.start/addLayer` (`build` + `launch` split).
- Media Session `play` action resumes the context.

## Verification

- `tests/audio/ambient.test.ts` "Ambience is identical across device sample rates": 4/4 fail against the old `noise.ts` (e.g. wind @ 22.05 kHz, 125 Hz band: 2.86 dB), 4/4 pass after.
- `npm test`: 118/118 across 17 files. `npm run build`: success.
- Headless Chromium smoke (init script records every AudioContext, stubs `navigator.audioSession`):
  - Start Meditating: 1 context, `latencyHint: "playback"`, audio session `playback`, `running`, no banner.
  - Device suspend with resume refused: banner shown, timer frozen at 14:52; Resume tap → `running`, banner gone, timer continues 14:51.
  - Device suspend with resume allowed: auto-recovered to `running`, no banner.
  - End Session: `suspended` ~1.5 s later, no banner.
  - Studio Play → same context `running`; preset start stops Studio (`getNowPlaying()` null); still 1 context.
  - `resume()` that never settles: Player opens immediately, no banner at 0.4 s, banner at 2 s, Resume → plays from 15:00.

## Deviations from Plan

- Multi-rate test seeds `Math.random` by direct swap: `vi.spyOn` recorded millions of calls at 192 kHz and ran the vitest worker out of memory.
- Banner background made opaque after the smoke screenshot showed the timer bleeding through the sticky alert.

## Human Verification Pending

- iPhone (Safari 16.4+), ring/silent switch ON: session is audible.
- iPhone: incoming call / alarm mid-session → after it ends, audio resumes or "Resume audio" appears; session continues where it stopped.
- Desktop with a 96/192 kHz output device: ambience level/tone matches a 48 kHz device.
- Low-end Android: live ambience swap during a session has no click.

## Commits

- `0c9d1df` fix(audio): sample-rate-invariant ambience; build graphs before reading the clock
- `e907e76` feat: shared AudioContext lifecycle (with quick-260925-k3m, same files)
