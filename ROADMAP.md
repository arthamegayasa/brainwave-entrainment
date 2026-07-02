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
