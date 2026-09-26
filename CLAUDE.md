## Project

**Healing Audio PWA**

Aplikasi web (PWA) brainwave entrainment untuk healing, relaksasi, meditasi, tidur, dan fokus — terinspirasi EquiSync Element (EOC Institute), tetapi dengan pendekatan **goal-first, bukan frequency-first**: user memilih tujuan (mis. "Deep Sleep"), bukan angka Hz. Semua audio disintesis real-time via Web Audio API — tanpa file audio sama sekali.

**Core Value:** User bisa menekan satu tombol dan mendapatkan sesi audio entrainment berkualitas (binaural / isochronic / solfeggio / ambient) yang benar-benar menuntun otak secara bertahap (session ramp), tanpa perlu paham frekuensi.

### Constraints

- **Audio engine murni TypeScript tanpa dependency React** — testable, reusable untuk M003 builder.
- iOS background audio terbatas — mitigasi via Media Session API (M002) + guidance ke user.
- Semua konstanta frekuensi preset terpusat di satu file (`presets.ts`).

## Agent skills

### Issue tracker

GitHub Issues on `arthamegayasa/brainwave-entrainment`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` glossary at the root; ADRs live in `DECISIONS.md` (not `docs/adr/`). See `docs/agents/domain.md`.
