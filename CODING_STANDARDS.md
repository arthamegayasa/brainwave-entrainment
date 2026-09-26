# Coding standards

Aturan yang dicek saat review (`/code-review`). Alasan dan gotcha per area ada di `docs/knowledge/`.

## Umum

- Bahasa kode/komentar/commit: English. UI: English (diubah dari Indonesia atas permintaan user, 2026-07-03).
- **Framing produk**: SwaraSanti adalah *non-invasive brainwave audio entrainment*: sesi audio yang dirancang untuk menuntun brainwave menuju band tertentu, hanya lewat suara. Copy menonjolkan metode ini; istilah *neuromodulasi non-invasif* boleh dipakai untuk menyebut kategori metodenya. Tujuan yang disebut tetap non-medis (tidur, fokus, relaksasi, meditasi, energi). Jangan klaim diagnosis, pengobatan, penyembuhan, atau pencegahan penyakit maupun kondisi (mis. "mengobati insomnia", "memperbaiki otak"), dan jangan klaim efek yang pasti: bukti ilmiah entrainment masih campuran (halaman Science).
- Setiap perubahan perilaku disertai test yang terfokus (lihat `docs/knowledge/testing.md`).

## Audio

- Semua konstanta frekuensi preset di satu file `presets.ts` — mudah di-tweak.
- Audio engine murni TypeScript tanpa dependency React (testable, dan dipakai ulang oleh Studio).
- **Click/pop prevention**: jangan set `gain.value` langsung — selalu `setTargetAtTime`/`linearRampToValueAtTime`. Fade-in/out master minimal ~50ms.
- **Timer drift**: jangan andalkan `setTimeout` untuk jadwal audio; pakai `AudioContext.currentTime` sebagai clock (pattern "lookahead scheduler", Chris Wilson "A Tale of Two Clocks").
- Logika audio tinggal di `src/audio/`.

## Input tak tepercaya & akses data

- **Untrusted JSON import**: semua nilai preset yang di-import di-clamp ke rentang aman (freq 20-1500, gain 0-1, name ≤ 60 char) — import = untrusted input.
- **Trust boundary cloud spec**: setiap `spec` JSONB dari `custom_audios` WAJIB lewat `sanitizeSession` sebelum menyentuh BuilderEngine — sama seperti JSON import. Sanitizer juga membatasi jumlah layer (cap 12; tiap layer = node audio + noise buffer nyata → vektor exhaustion) dan me-regenerate layer id duplikat (BuilderEngine key `live` Map by id; duplikat = layer orphan yang `stop()` tidak bisa jangkau).
- **Multi-tenant RLS — batasi kolom, bukan hanya baris**: policy `FOR ALL ... created_by = auth.uid()` melindungi kepemilikan baris, TAPI kolom sensitif (mis. `is_template` yang membuat audio kelihatan app-wide) harus dibatasi di `WITH CHECK` — kalau tidak, klinisi bisa PATCH `is_template=true` via PostgREST dan inject konten global. Gate UI (tombol admin-only) tidak cukup; klien bisa hit REST langsung.
- Migration yang sudah diterapkan tidak pernah diubah; perubahan skema selalu lewat migration baru (ADR-023).

## Waktu

- **Aritmetika minggu/hari lokal: selalu setDate(), jangan +N×24 jam ms** — DST fall-back membuat minggu lokal 169 jam; penambahan milidetik tetap mendarat 1 jam meleset dan menjatuhkan data di jam terakhir Minggu.
- **State berbasis waktu di React**: nilai turunan waktu (mis. `recommendedPresetId`) harus di-refresh via interval + `visibilitychange`, dan di-resolve ulang di click handler — PWA tab bisa hidup berjam-jam tanpa remount.
