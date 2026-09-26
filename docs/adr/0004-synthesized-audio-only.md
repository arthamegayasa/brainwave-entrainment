# ADR-004: Audio 100% synthesized via Web Audio API (2026-07-02)

**Context:** EquiSync memakai file audio ter-render. Alternatif: file audio vs sintesis real-time.
**Decision:** Semua audio (entrainment tones, solfeggio, ambient noise) disintesis real-time dengan Web Audio API. Tanpa file audio.
**Rationale:** Frekuensi presisi (penting untuk binaural/solfeggio), durasi tak terbatas, ukuran app kecil, offline penuh, nol biaya hosting audio, dan memungkinkan ramp frekuensi kontinu (tidak mungkin dengan file statis).
**Consequences:** Kualitas ambient bergantung kualitas sintesis noise (filtered noise); perlu perhatian ke AudioContext autoplay policy (resume via user gesture) dan gain ramp untuk hindari click/pop.
**Status:** Accepted.
