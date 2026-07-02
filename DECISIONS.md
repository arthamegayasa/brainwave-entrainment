# DECISIONS.md — ADR Log (append-only)

## ADR-001: Platform — Web App / PWA (2026-07-02)

**Context:** Pilihan antara PWA, mobile native (React Native/Expo), desktop (Electron/Tauri).
**Decision:** Web app / PWA.
**Rationale:** Web Audio API paling matang di browser; development & distribusi tercepat; installable di desktop & mobile. Trade-off yang diterima: background audio di iOS terbatas (mitigasi: Media Session API + screen-on guidance).
**Status:** Accepted (dipilih user via decision session).

## ADR-002: Scope MVP — Preset player dulu, builder menyusul (2026-07-02)

**Context:** EquiSync Element powerful tapi intimidating (frequency-first). Pilihan: preset player dulu vs full builder vs keduanya.
**Decision:** MVP = preset player berbasis tujuan (8 preset). Advanced builder ditunda ke M003.
**Rationale:** Cepat jadi & langsung berguna; menghindari UX intimidating; builder butuh fondasi engine yang sama sehingga tidak ada pekerjaan terbuang.
**Status:** Accepted (dipilih user).

## ADR-003: Target — Pemakaian pribadi, tanpa backend (2026-07-02)

**Decision:** Tanpa akun/pembayaran/backend. Preferensi & custom tweak disimpan di localStorage.
**Rationale:** Fokus ke kualitas audio & fungsi. Jalur upgrade ke produk publik tetap terbuka.
**Status:** Accepted (dipilih user).

## ADR-004: Audio 100% synthesized via Web Audio API (2026-07-02)

**Context:** EquiSync memakai file audio ter-render. Alternatif: file audio vs sintesis real-time.
**Decision:** Semua audio (entrainment tones, solfeggio, ambient noise) disintesis real-time dengan Web Audio API. Tanpa file audio.
**Rationale:** Frekuensi presisi (penting untuk binaural/solfeggio), durasi tak terbatas, ukuran app kecil, offline penuh, nol biaya hosting audio, dan memungkinkan ramp frekuensi kontinu (tidak mungkin dengan file statis).
**Consequences:** Kualitas ambient bergantung kualitas sintesis noise (filtered noise); perlu perhatian ke AudioContext autoplay policy (resume via user gesture) dan gain ramp untuk hindari click/pop.
**Status:** Accepted.

## ADR-005: Stack — Vite + React + TypeScript (2026-07-02)

**Decision:** Vite + React + TypeScript. State ringan (tanpa Redux). Styling: CSS modern (custom, calm dark theme, mobile-first).
**Rationale:** Iterasi cepat, TS penting untuk logika audio scheduler yang rawan bug angka, ekosistem PWA (vite-plugin-pwa) matang.
**Status:** Accepted.

## ADR-006: Session ramp sebagai inti "healing logic" (2026-07-02)

**Decision:** Setiap preset adalah kurva frekuensi (ramp turun dari ±kondisi sadar → target → hold → ramp naik di akhir; preset tidur tanpa ramp naik), bukan frekuensi statis.
**Rationale:** Meniru cara otak "dituntun" bertahap (frequency following response) — praktik standar program entrainment yang efektif, dan pembeda utama dari tone generator biasa.
**Status:** Accepted.
