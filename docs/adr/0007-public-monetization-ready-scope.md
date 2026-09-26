# ADR-007: Scope pivot — produk publik lengkap, monetization-ready (2026-07-02)

**Context:** User mengubah scope di tengah M001: dari "preset player untuk pemakaian pribadi" menjadi produk publik lengkap yang siap dimonetisasi, dikerjakan otonom sampai selesai.
**Decision:** Supersedes ADR-002 (preset-first) dan ADR-003 (personal use) untuk scope, TIDAK untuk urutan build (engine tetap dibangun dulu). Scope final v1:
1. Preset player goal-first (8 preset) + advanced session builder (ala EquiSync Element).
2. Landing page publik + halaman Science/Research berisi riset pendukung dengan sitasi jujur.
3. PWA installable + Media Session + persistence localStorage.
4. Arsitektur monetization-ready: free/premium tier flags, gating UI, halaman upgrade — TANPA payment processing live (butuh kredensial Stripe/backend; ditunda sampai user menyediakan). Semua fitur unlocked di build ini.
5. Premium visual design, sangat user-friendly & interaktif.
**Status:** Accepted (instruksi user, autonomous mode).
