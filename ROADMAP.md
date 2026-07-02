# ROADMAP.md — Milestone Tracker

## M001 — Audio Engine + Preset Player (MVP) [ACTIVE]

- Audio engine (TS murni): binaural, isochronic, monaural, solfeggio layer, ambient noise (rain/ocean/wind/brown), mixer per-layer + master, fade tanpa click.
- SessionScheduler: kurva ramp frekuensi per preset (turun–hold–naik; sleep tanpa naik), clock berbasis AudioContext.currentTime.
- 8 preset tujuan: Deep Sleep, Deep Meditation, Healing & Relaxation, Anxiety Relief, Focus, Energy, Creativity, Power Nap.
- Player UI: pilih tujuan → durasi (15/30/45/60/∞) → mode headphone/speaker → ambient → play. Mixer volume. Timer countdown. Panel detail frekuensi (opsional dibuka).
- Dark calm theme, mobile-first, responsive.

## M002 — Polish & PWA

- PWA installable + offline (vite-plugin-pwa).
- Media Session API (kontrol lockscreen).
- Simpan tweak user per preset (localStorage).
- Visualisasi sesi: kurva frekuensi berjalan + posisi saat ini.
- Kualitas ambient ditingkatkan (modulasi ocean waves, rain granular).

## M003 — Advanced Builder (ala EquiSync Element)

- Multi-layer editor: tambah/hapus layer, tiap layer pilih metode entrainment sendiri.
- Frequency finder: saran frekuensi harmonis dari base frequency.
- Session shape editor: gambar kurva ramp sendiri + repeat (legs).
- Export/import preset (JSON).

## Backlog / Ideas

- Produk publik: landing page, SEO, analytics.
- Background music layer generatif (pad/drone).
- Breathing guide visual sinkron dengan sesi.

## Scope Update (2026-07-02, ADR-007)

M001 diperluas menjadi produk publik lengkap dalam 5 phase (lihat .planning/ROADMAP.md):
1. Audio Engine Core • 2. Session Scheduler & Presets • 3. Player UI & Mixer (premium design) • 4. Advanced Session Builder (ala Element) • 5. Public Launch & Monetization-Ready (landing, science page bercitasi, PWA, Media Session, persistence, free/premium scaffold).
M002/M003 lama sudah terserap ke dalam M001 baru. Payment live (Stripe) + akun = v2.
