# ADR-008: Subscription pricing — IDR, Indonesia-first (2026-07-03)

**Context:** Menetapkan harga langganan. Kompetitor terdekat (2026): Endel $6.99/mo·$49.99/yr, Brain.fm $9.99/mo·~$70/yr; industri (RevenueCat/Adapty) menunjukkan plan tahunan mendominasi revenue Health & Fitness (~60%), churn 51% lebih rendah. User memilih pasar Indonesia-first (global menyusul) dan tier Bulanan + Tahunan (tanpa lifetime).
**Decision:** Harga IDR: **Free Rp0**, **Premium Bulanan Rp49.000**, **Premium Tahunan Rp249.000** (≈Rp20.750/bln, "Save 58%"). Tahunan sebagai hero (default terpilih). Konstanta terpusat di `src/state/tier.ts → PRICING`, di-key per-currency agar blok USD bisa ditambah saat fase global tanpa mengubah komponen.
**Rationale:** Menyesuaikan willingness-to-pay Indonesia; annual-hero memaksimalkan retensi/cash; struktur currency-keyed menjaga jalur ke global.
**Status:** Accepted. USD/global = fase berikutnya.
