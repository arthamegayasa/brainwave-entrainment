# Walking Skeleton — Healing Audio PWA

**Phase:** 1
**Generated:** 2026-07-02

## Capability Proven End-to-End

Pengguna membuka app di browser, menekan satu tombol audisi (user gesture → AudioContext resume), dan mendengar binaural beat stereo (200 Hz kiri / 210 Hz kanan) yang disintesis real-time oleh engine TypeScript murni — dengan unit test yang meng-assert audio yang benar-benar dirender di Node.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Vite 8.1.3 + React 19.2.7 + TypeScript (template react-ts) | ADR-005 — iterasi cepat; TS untuk logika scheduler rawan bug angka; ekosistem PWA (vite-plugin-pwa, M002) matang |
| Audio layer | Web Audio API native, 100% synthesized, zero file audio | ADR-004 — frekuensi presisi, durasi bebas, offline penuh, memungkinkan ramp kontinu Phase 2 |
| Engine architecture | `src/audio/` pure TS, ZERO React import; `AudioEngine` menerima `BaseAudioContext` via constructor injection; layer registry `Partial<Record<SoundKind, LayerFactory>>` | ENG-07 — unit-testable dan reusable untuk builder M003; injection memungkinkan OfflineAudioContext di test dan AudioContext (post-gesture) di browser |
| Data layer | Tidak ada database/backend — konstanta internal `src/audio/constants.ts` (→ `presets.ts` di Phase 2); preferensi user via localStorage (M002) | ADR-003 — pemakaian pribadi, no backend |
| Auth | Tidak ada | ADR-003 |
| Testing | Vitest 4.1.9 environment `node` + `node-web-audio-api` 2.0.0 — assertion terhadap render OfflineAudioContext NYATA (zero-crossing, pulse count, maxDelta), bukan mock | Terverifikasi empiris di Windows x64 mesin ini (01-RESEARCH.md); mock tidak memverifikasi suara |
| Deployment target | Static build (`vite build`) — dijalankan lokal via `npm run dev`; hosting CDN statis menyusul | SPA client-only tanpa server |
| Directory layout | `src/audio/{engine.ts, ramps.ts, noise.ts, types.ts, constants.ts, layers/*.ts}` + `src/App.tsx` (UI) + `tests/audio/*.test.ts` | Boundary React/engine eksplisit; guard test otomatis menolak import React di `src/audio/` |

## Kontrak Inti (jangan dinegosiasi ulang di fase berikutnya)

- `AudioEngine`: `play(kind)`, `stop()`, `setMasterVolume(v)` (clamp ≤ 1.0 — safety telinga), `implementedKinds`.
- `SoundLayer`: `{ output: GainNode; start(t); stop(t) }` — semua start/stop lewat fade `ramps.ts`.
- Disiplin ramp: tidak ada `gain.value =` langsung saat audio berjalan; tidak ada `exponentialRampToValueAtTime(0)`; tidak ada `setTimeout` untuk timing audio (clock = `ctx.currentTime`).
- Isochronic: LFO → WaveShaper curve MONOTONIC → `gain.gain` — beat Hz Phase 2 di-ramp cukup lewat `lfo.frequency`.

## Stack Touched in Phase 1

- [x] Project scaffold (Vite, TS, ESLint template, Vitest node env) — plan 01-01
- [x] Routing — SPA satu halaman (App.tsx); routing multi-view bukan kebutuhan produk ini
- [x] Data — read/write nyata terhadap audio graph (pengganti DB pada app client-only): engine menulis node graph, test membaca buffer render
- [x] UI — tombol audisi per jenis suara + Stop + slider master volume, wired ke AudioEngine — plan 01-02
- [x] Deployment — perintah run lokal full-stack terdokumentasi: `npm run dev` (audisi), `npm test` (render assertions), `npm run build` (produksi statis)

## Out of Scope (Deferred to Later Slices)

- SessionScheduler, kurva ramp frekuensi, auto-stop dengan fade — Phase 2
- 8 preset tujuan + `presets.ts` penuh + mode Headphone/Speaker — Phase 2
- UI goal-first, mixer per-layer, timer, panel frekuensi, dark calm theme — Phase 3
- PWA offline, Media Session API, localStorage tweaks, visualisasi — M002
- Advanced builder (multi-layer editor, dsb.) — M003
- Kualitas "granular droplets" untuk rain — M002 (sesuai roadmap)

## Subsequent Slice Plan

Tiap fase berikutnya menambah satu vertical slice di atas skeleton ini tanpa mengubah keputusan arsitekturnya:

- Phase 2: SessionScheduler + 8 preset — kurva ramp menuntun `lfo.frequency`/`osc.frequency` via AudioParam automation, clock `ctx.currentTime`
- Phase 3: Player UI goal-first — React memanggil API engine/scheduler yang sama; mixer = GainNode per layer yang sudah ada
