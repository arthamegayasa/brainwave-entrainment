# Frontend

Gotcha React, CSS, dan PWA di `src/ui/` dan `src/state/`.

## State & sinkronisasi

- **Dua permukaan UI yang memutasi data yang sama** (Account sheet vs Library untuk koneksi klinisi): sheet overlay tidak meng-unmount view di bawahnya — sinkronkan via `window.dispatchEvent(new Event("serenade:clinician-changed"))` + listener yang mem-bump dependency effect. Pola ringan tanpa store global. Contoh ini sudah tidak ada sejak #9: Patient tidak lagi memutus Link sendiri, dan Clinician-nya kini dibaca `useEntitlement` (`link`).

## Laporan Listening History

- **Zona waktu laporan = zona Play terbaru**, bukan zona perangkat viewer; zona yang tidak dikenal browser dilewati. Label WIB/WITA/WIT dari tabel tetap, zona lain memakai nama pendek Intl (mis. `GMT+9`).
- **Chromium en-GB menulis September sebagai "Sept"** (ICU baru), bukan "Sep" seperti di prototype.
- **Level heading laporan mengikuti tempatnya**: `headingLevel` 4 di Account (di bawah `h3` "Your listening"), 5 di Dashboard (di bawah `h4` "Listening history" dari `.detail-block`). Gaya judul kartu disatukan lewat `.lr .lr-card-title`, jadi `.detail-block h4` tidak mengenainya.
- **Laporan yang terbuka memuat ulang sendiri**: setiap 5 menit dan saat tab kembali terlihat (aturan state berbasis waktu di `CODING_STANDARDS.md`), sehingga "hari ini" berganti lewat tengah malam; reload yang gagal mempertahankan laporan yang sudah tampil.

## CSS

- **CSS grid `1fr` = `minmax(auto, 1fr)`**: min-content kartu berharga panjang memeras kolom lain. Kolom sama rata butuh `minmax(0, 1fr)` — dan konten yang tadinya "mendorong" kolom (harga coret + harga) harus bisa wrap, kalau tidak ia meluber.
- **Container query tidak bisa menata container-nya sendiri**: `@container` hanya berlaku untuk turunan. Prototype menaruh `--lh-a-cell-h` di `.lh-a` (container itu sendiri) di dalam query, sehingga tidak pernah berlaku. Di `.lr` variabel tinggi sel heatmap ditaruh di `.lr-heat` (turunan).
- **Card rows di container query**: `.roster-table td { display: block }` (0,1,1) mengalahkan `.roster-c-plays { display: none }` (0,1,0) di query yang sama — sembunyikan kolom dengan `.roster-table .roster-c-…`. Prototype punya bug yang sama.
- **Drawer di atas notifikasi**: drawer di-portal ke `#root` (z-index 90 di stacking context `#root`), jadi notifikasi Dashboard (`.dash-notice`, fixed, z 95) tetap terlihat saat drawer terbuka.

## Build, PWA & unduhan

- **Code-split**: `React.lazy` untuk export bernama butuh `.then((m) => ({ default: m.X }))`; view di luar jalur pilih-goal-lalu-dengar + encoder lamejs (164.5 kB) dimuat saat dipakai. Chunk utama 554.7 → 338.3 kB (gzip 170 → 98.5). supabase-js masih di chunk utama karena `lib/supabase.ts` membuat client saat module load — memindahkannya butuh API client async di 7 modul `lib/`.
- **PWA service worker menahan shell lama pasca-deploy**: verifikasi live pasca-deploy harus cek hash bundle dari server (curl, tanpa SW) sebelum menyimpulkan dari browser — atau unregister SW + clear caches + reload. User nyata mendapat update setelah reload berikutnya (workbox default).
- **Blob URL download**: `URL.revokeObjectURL` langsung setelah `a.click()` bisa membatalkan unduhan di Safari — tunda (60 s).
