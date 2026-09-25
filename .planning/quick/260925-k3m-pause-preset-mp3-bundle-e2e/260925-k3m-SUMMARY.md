---
phase: quick-260925-k3m
plan: 01
subsystem: audio, ui, testing
tags: [pause, media-session, mp3-export, code-splitting, playwright, e2e, css-grid]

requires:
  - phase: quick-260925-r7d
    provides: Shared AudioContext manager (src/ui/audioContext.ts)
  - phase: quick-260714-df1
    provides: Offline render + lamejs MP3 encoder
provides:
  - Real Pause/Resume (Player + lock screen), audio-clock completion time
  - Preset MP3 export from the session setup sheet
  - App-wide MP3 export store (src/ui/mp3Export.ts)
  - Lazy-loaded views and MP3 encoder
  - Playwright E2E suite wired into CI
affects: [player, home, dashboard, build, ci]

key-files:
  created:
    - src/ui/mp3Export.ts
    - playwright.config.ts
    - tsconfig.e2e.json
    - e2e/helpers.ts
    - e2e/session.spec.ts
    - e2e/export.spec.ts
    - e2e/premium.spec.ts
  modified:
    - src/ui/audioContext.ts
    - src/ui/useSession.ts
    - src/ui/Player.tsx
    - src/App.tsx
    - src/App.css
    - src/audio/export.ts
    - src/ui/Home.tsx
    - src/ui/Dashboard.tsx
    - tests/audio/export.test.ts
    - tsconfig.json
    - package.json
    - package-lock.json
    - .github/workflows/checks.yml
    - .gitignore

key-decisions:
  - "Pause suspends the shared context; a userPaused flag keeps auto-resume and the device-pause banner from undoing it"
  - "Preset export renders through SessionEngine (not a BuilderEngine translation) so it matches live playback; speaker mode renders mono"
  - "One MP3 export app-wide (Audio Bank + presets share the store)"
  - "supabase-js stays in the main chunk: lazy-loading it needs an async client API across 7 lib modules"

requirements-completed: [QUICK-260925-K3M]

completed: 2026-09-25
---

# Quick Task 260925-k3m: Pause, Preset MP3, Premium Layout, Bundle Split, E2E

## Accomplishments

- **Pause/Resume:** Player button, "Paused" label, frozen orb; Media Session pause/play. The audio clock stops, so timer, curve, and end wait in place. Completion is credited at `now − (elapsed − duration)`.
- **Preset MP3:** "Download as MP3" in the setup sheet for 15–60 min, using the chosen mode, ambience, and mixer volumes. Infinite is disabled with a hint; ≥45 min shows the device warning. Audio Bank moved onto the same app-wide store.
- **Premium layout:** equal columns via `minmax(0, 1fr)`, 1000 px page at ≥1020 px, anchor price on its own line.
- **Bundle:** main chunk 554.7 → 338.3 kB (gzip 170.1 → 98.5 kB); encoder 164.5 kB and each off-path view (4.7–13.8 kB) load on demand; >500 kB warning gone.
- **E2E:** Playwright (Chromium) against `vite preview`; `npm run test:e2e`; CI installs Chromium and runs it after the build.

## Verification

- Unit: `npm test` 120/120 (17 files), incl. new preset-export tests (headphone stereo L=200 Hz, R−L ≥ 5 crossings/s; speaker mono).
- E2E: 8/8 in 1.1 min — pause/resume/end with context states; device pause refused → banner → Resume; device pause allowed → silent recovery; 15-min preset download `Serenade-Meditating-15-min-headphones.mp3`; ∞ disabled; Premium layout at 390/800/1280 px.
- Exported MP3 probed: 900.05 s, 44.1 kHz, 2 ch, 320 kbps; spectrum at 60–64 s: L 527.98 Hz, R 537.32 Hz (beat 9.34 Hz, curve expects ~9.3).
- Premium widths measured at 390/800/1024/1280/1600 px: equal, no overflow.

## Human Verification Pending

- iPhone lock screen: pause/play buttons pause and resume the session.
- iPhone: a 60-min headphone export may exceed tab memory (same limit as Audio Bank exports); 15–30 min expected fine.

## Commits

- `e907e76` feat: device-robust playback, pause, preset MP3 export, lazy bundle, E2E
