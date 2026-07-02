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

## ADR-007: Scope pivot — produk publik lengkap, monetization-ready (2026-07-02)

**Context:** User mengubah scope di tengah M001: dari "preset player untuk pemakaian pribadi" menjadi produk publik lengkap yang siap dimonetisasi, dikerjakan otonom sampai selesai.
**Decision:** Supersedes ADR-002 (preset-first) dan ADR-003 (personal use) untuk scope, TIDAK untuk urutan build (engine tetap dibangun dulu). Scope final v1:
1. Preset player goal-first (8 preset) + advanced session builder (ala EquiSync Element).
2. Landing page publik + halaman Science/Research berisi riset pendukung dengan sitasi jujur.
3. PWA installable + Media Session + persistence localStorage.
4. Arsitektur monetization-ready: free/premium tier flags, gating UI, halaman upgrade — TANPA payment processing live (butuh kredensial Stripe/backend; ditunda sampai user menyediakan). Semua fitur unlocked di build ini.
5. Premium visual design, sangat user-friendly & interaktif.
**Status:** Accepted (instruksi user, autonomous mode).

## ADR-008: Subscription pricing — IDR, Indonesia-first (2026-07-03)

**Context:** Menetapkan harga langganan. Kompetitor terdekat (2026): Endel $6.99/mo·$49.99/yr, Brain.fm $9.99/mo·~$70/yr; industri (RevenueCat/Adapty) menunjukkan plan tahunan mendominasi revenue Health & Fitness (~60%), churn 51% lebih rendah. User memilih pasar Indonesia-first (global menyusul) dan tier Bulanan + Tahunan (tanpa lifetime).
**Decision:** Harga IDR: **Free Rp0**, **Premium Bulanan Rp49.000**, **Premium Tahunan Rp249.000** (≈Rp20.750/bln, "Save 58%"). Tahunan sebagai hero (default terpilih). Konstanta terpusat di `src/state/tier.ts → PRICING`, di-key per-currency agar blok USD bisa ditambah saat fase global tanpa mengubah komponen.
**Rationale:** Menyesuaikan willingness-to-pay Indonesia; annual-hero memaksimalkan retensi/cash; struktur currency-keyed menjaga jalur ke global.
**Status:** Accepted. USD/global = fase berikutnya.

## ADR-009: Payments — Midtrans-first via Supabase backend, multi-gateway (2026-07-03)

**Context:** User memilih Midtrans sebagai gateway (ideal untuk Indonesia: QRIS/VA/GoPay/ShopeePay/kartu + Subscription API). Midtrans IDR-only (regulasi Bank Indonesia), bukan Merchant-of-Record, dan — seperti gateway mana pun — wajib backend (Server Key rahasia + webhook verifikasi + entitlement server-verified).
**Decision:** Integrasi payment memakai backend **Supabase** (Auth + tabel `entitlements` + RLS + edge functions `create-transaction` Snap & `midtrans-webhook` verifikasi SHA512). Abstraksi `PaymentProvider` agar **Stripe/Merchant-of-Record** bisa ditambah untuk fase global tanpa mengubah frontend. Desain lengkap: `docs/payments/PAYMENTS-ARCHITECTURE.md`. Build ini hanya UI harga + scaffold; go-live menunggu Midtrans sandbox keys + project Supabase.
**Consequences:** **Men-supersede ADR-003 ("no backend")** khusus untuk permukaan monetisasi — backend diperkenalkan untuk payment + entitlement terverifikasi server. Audio engine & sintesis tetap 100% client-side. Recurring hands-off hanya untuk kartu; QRIS/VA/e-wallet perlu renewal via expiry + reminder.
**Status:** Accepted (design). Eksekusi backend = pass berikutnya saat kredensial tersedia.
