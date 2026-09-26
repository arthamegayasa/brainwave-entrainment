# SwaraSanti

PWA brainwave entrainment **goal-first**: User memilih tujuan (mis. Sleeping), bukan angka Hz, lalu satu tombol memulai sesi yang menuntun bertahap lewat session ramp. Semua audio disintesis real-time dengan Web Audio API, tanpa file audio. Clinician memakai platform yang sama untuk membimbing Patient-nya.

## Docs

Gotcha per area: baca sebelum mengubah area itu.

- **Audio** (`src/audio/`, `src/ui/audioContext.ts`, engine, ekspor MP3): `docs/knowledge/web-audio.md`
- **Entrainment** (preset, frekuensi, copy Science): `docs/knowledge/entrainment.md`
- **Supabase** (migration, RLS, edge function, Auth, payment): `docs/knowledge/supabase.md`; checkout juga `docs/payments/PAYMENTS-ARCHITECTURE.md`
- **Frontend** (React state, CSS, PWA): `docs/knowledge/frontend.md`
- **Testing** (Vitest, Playwright, pgTAP, smoke di stack lokal): `docs/knowledge/testing.md`

Aturan kode yang dicek saat review: `CODING_STANDARDS.md`.

## Agent skills

### Issue tracker

GitHub Issues on `arthamegayasa/brainwave-entrainment`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` glossary + ADRs in `docs/adr/`. See `docs/agents/domain.md`.
