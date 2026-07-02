# Healing Audio PWA

## What This Is

Aplikasi web (PWA) brainwave entrainment untuk healing, relaksasi, meditasi, tidur, dan fokus — terinspirasi EquiSync Element (EOC Institute), tetapi dengan pendekatan **goal-first, bukan frequency-first**: user memilih tujuan (mis. "Deep Sleep"), bukan angka Hz. Semua audio disintesis real-time via Web Audio API — tanpa file audio sama sekali.

## Core Value

User bisa menekan satu tombol dan mendapatkan sesi audio entrainment berkualitas (binaural / isochronic / solfeggio / ambient) yang benar-benar menuntun otak secara bertahap (session ramp), tanpa perlu paham frekuensi.

## Context

- Owner: pemakaian pribadi (single user), tanpa akun/backend/pembayaran.
- Referensi kompetitor: EquiSync Element — powerful tapi intimidating, frequency-first, berbayar, UI dated.
- Pembeda utama: preset berbasis tujuan + session ramp otomatis + sintesis real-time (frekuensi presisi, durasi bebas, offline).
- Canonical docs di root: PROJECT.md, DECISIONS.md (6 ADR), KNOWLEDGE.md (domain + Web Audio gotchas), ROADMAP.md (M001–M003).

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Audio engine: binaural beats, isochronic tones, monaural beats — synthesized via Web Audio API
- [ ] Solfeggio frequencies sebagai carrier atau pure-tone layer
- [ ] Ambient layer tersintesis: rain, ocean, wind, brown noise
- [ ] SessionScheduler: kurva ramp frekuensi per preset (turun–hold–naik; sleep tanpa naik), clock berbasis AudioContext.currentTime
- [ ] 8 preset tujuan: Deep Sleep, Deep Meditation, Healing & Relaxation, Anxiety Relief, Focus, Energy, Creativity, Power Nap
- [ ] Player UI: pilih tujuan → durasi (15/30/45/60/∞) → mode headphone/speaker → ambient → play
- [ ] Mixer: volume per layer + master, fade tanpa click
- [ ] Timer countdown + auto-stop dengan fade-out
- [ ] Panel detail frekuensi (opsional dibuka)
- [ ] Dark calm theme, mobile-first, responsive

### Out of Scope

- Advanced builder ala Element (multi-layer editor, frequency finder, shape editor) — M003
- Akun / subscription / backend / cloud sync — target pemakaian pribadi
- Audio file / streaming — semua synthesized (ADR-004)
- Klaim medis — framing: relaxation & meditation tool
- PWA offline + Media Session API + visualisasi sesi — M002 (polish), bukan MVP inti

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Platform: Web app / PWA | Web Audio API matang, tercepat dibangun & dibagikan | — Pending |
| MVP: preset player dulu | Hindari UX intimidating ala Element; cepat berguna | — Pending |
| Target: pribadi, no backend | Fokus kualitas audio; localStorage untuk preferensi | — Pending |
| Audio 100% synthesized | Frekuensi presisi, durasi bebas, offline, nol hosting | — Pending |
| Stack: Vite + React + TS | Iterasi cepat; TS untuk logika scheduler rawan bug angka | — Pending |
| Session ramp sebagai inti | Otak "dituntun" bertahap — pembeda dari tone generator | — Pending |

## Constraints

- **Audio engine murni TypeScript tanpa dependency React** — testable, reusable untuk M003 builder.
- iOS background audio terbatas — mitigasi via Media Session API (M002) + guidance ke user.
- Semua konstanta frekuensi preset terpusat di satu file (`presets.ts`).

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-02 after initialization*
