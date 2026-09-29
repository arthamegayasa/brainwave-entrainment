# Brainwave entrainment

Latar belakang domain untuk preset, frekuensi, dan copy Science.

## Konsep

- **Binaural beats**: dua tone beda frekuensi di telinga kiri/kanan (L=carrier, R=carrier+beat). Otak mempersepsi selisihnya sebagai "beat". **Wajib headphone/stereo terpisah.** Carrier ideal 100–500 Hz; beat = frekuensi brainwave target.
- **Isochronic tones**: satu tone yang di-pulse on/off pada beat Hz (amplitude modulation). **Bekerja tanpa headphone.** Envelope pulse harus halus (trapezoid/raised-cosine), bukan square — square menghasilkan click.
- **Monaural beats**: dua tone dijumlahkan sebelum sampai ke telinga → beat fisik di udara. Bekerja di speaker.
- **Band brainwave**: Delta 0.5–4 Hz (tidur nyenyak), Theta 4–8 Hz (meditasi dalam, healing), Alpha 8–13 Hz (relaks, anti-cemas), Beta 13–30 Hz (fokus), Gamma 30–100 Hz — umum dipakai 40 Hz (energi, kognisi).
- **Solfeggio frequencies**: 174, 285, 396, 417, 528, 639, 741, 852, 963 Hz. Praktik umum (termasuk EquiSync): dipakai sebagai **carrier** untuk binaural/isochronic, atau pure tone layer. 528 Hz = "healing/DNA repair" (klaim tradisional, bukan medis).
- **Schumann resonance**: 7.83 Hz — populer untuk preset healing/grounding (di border theta/alpha).
- **Ramp logic**: mulai dari frekuensi dekat kondisi sadar (10–14 Hz), turun bertahap (linear/exponential) ke target, hold, lalu ramp naik pelan di akhir sesi agar user tidak "grogi". Preset tidur: tanpa ramp naik. Preset memakai ramp linear (ADR-006). Setiap gerakan Journey Custom Audio (ADR-028) memilih satu dari empat kurva (ADR-029): S-curve sebagai default, agar laju Beat tidak berubah mendadak di ujung gerakan; Linear; Proportional (rasio sama tiap menit); dan Wave (berayun ke Beat sebelumnya lalu kembali). Bukti tentang bentuk kurva masih tipis, dan copy tidak boleh menjanjikan efek Wave: lihat `docs/research/beat-journey-curves.md`.
- **Solfeggio per Listening mode**: di Headphones (binaural) telinga kiri tepat di Carrier (mis. 528 Hz) dan telinga kanan di Carrier + Beat (mis. 534 Hz), jadi Solfeggio hanya tepat di satu telinga. Di Speaker (isochronic) satu nada Carrier dipulse di kedua telinga: Carrier tetap tepat, dengan sideband di Carrier ± Beat dari pulsanya. Karena itu Solfeggio paling akurat di isochronic (owner, 2026-09-27).

## Preset & band

- **Konsistensi band**: `preset.band` (kurItorial) harus === `bandForHz(targetHz)` (derivasi) — kalau tidak, frekuensi sama tampil beda label antara Home dan Audio Bank. Dijaga test invarian atas semua preset.

## Referensi

- EquiSync Element: https://equisync.eocinstitute.org/meditation/element/ (fitur: full spektrum delta–gamma, multilayering, frequency finder, session shape/legs, volume per layer)
- EOC Institute binaural beats overview: https://eocinstitute.org/meditation/binaural-beats/
