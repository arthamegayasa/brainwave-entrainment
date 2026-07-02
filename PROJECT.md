# PROJECT.md — Healing Audio PWA

## Vision

Aplikasi web (PWA) brainwave entrainment untuk healing, relaksasi, meditasi, tidur, dan fokus — terinspirasi EquiSync Element (EOC Institute) tapi dengan pendekatan **goal-first, bukan frequency-first**: user memilih tujuan, bukan angka Hz. Semua audio disintesis real-time via Web Audio API (tanpa file audio), sehingga frekuensi presisi, durasi bebas, dan bisa offline.

## Target User

Pemakaian pribadi (owner). Tanpa akun, tanpa backend, tanpa pembayaran. Bisa berkembang jadi produk publik nanti (lihat ROADMAP).

## Scope (MVP)

- Audio engine: Binaural Beats, Isochronic Tones, Monaural Beats, Solfeggio (pure tone / sebagai carrier), ambient noise tersintesis (rain, ocean, wind, brown noise).
- SessionScheduler: kurva ramp frekuensi (turun–hold–naik) per preset, bukan frekuensi statis.
- 8 preset tujuan: Deep Sleep, Deep Meditation, Healing & Relaxation, Anxiety Relief, Focus, Energy, Creativity, Power Nap.
- Player UI: pilih tujuan → durasi (15/30/45/60 menit/∞) → mode (headphone=binaural / speaker=isochronic) → ambient → play. Mixer volume per layer + master. Panel detail frekuensi opsional.
- PWA installable, dark theme, calm design, mobile-first.

## Non-Goals (MVP)

- Advanced builder ala EquiSync Element (multi-layer editor, frequency finder, shape editor) — ditunda ke M003.
- Akun, subscription, backend, sinkronisasi cloud.
- Klaim medis. Framing produk: relaxation & meditation tool, bukan alat penyembuhan (bukti ilmiah entrainment untuk healing masih mixed; efek relaksasi nyata).
- Audio file/streaming — semua synthesized.

## Referensi

- EquiSync Element: https://equisync.eocinstitute.org/meditation/element/ (fitur: full spektrum delta–gamma, multilayering, frequency finder, session shape/legs, volume per layer)
- EOC Institute binaural beats overview: https://eocinstitute.org/meditation/binaural-beats/
