# ADR-029: Empat kurva gerakan Journey: S-curve, Linear, Proportional, Wave (2026-09-29)

Owner meminta kurva gerakan Journey yang ideal namun tetap sedikit, termasuk pola bolak-balik seperti 10 → 8 → 10 → 8 Hz. Riset di `docs/research/beat-journey-curves.md` tidak menemukan studi terkontrol yang membandingkan bentuk ramp, jadi set ini adalah keputusan desain yang berpijak pada praktik alat entrainment yang sudah mapan. Set ini menggantikan daftar kurva di ADR-028.

- **S-curve** tetap default. Lajunya nol di kedua ujung, jadi sambungan antar-gerakan tidak patah. Padanannya `-p sigmoid` di SBaGenX.
- **Linear** dipertahankan: Preset (ADR-006) dan Gnaural bergerak linear.
- **Proportional** menggantikan Fast → slow dan Slow → fast. Kurva ini mengubah Beat dengan rasio yang sama tiap menit, seperti default `-p drop` SBaGen, dan sejalan dengan ambang beda tempo yang relatif (±3%). Kurva ini benar di kedua arah: saat turun ia cepat lalu lambat, saat naik lambat lalu cepat. Dengan begitu tidak ada lagi pilihan "salah arah", misalnya Slow → fast untuk turun, yang justru berubah paling tajam tepat saat tiba di target.
- **Wave** baru. Beat berayun secara sinus antara Beat titik sebelumnya dan titik ini, dan setiap setengah ayunan adalah S-curve. Jumlah kedatangan di titik ini bisa 2–8 (default 3), dan gerakan selalu berakhir di titik ini. Yang disimpan adalah jumlah ayunan, bukan periode dalam menit, karena Play yang lebih pendek mempercepat semua gerakan (ADR-028) sehingga periode dalam menit tidak bisa dipertahankan.

`sanitizeSession` memutar spec lama berisi `ease-out` atau `ease-in` sebagai Proportional. Hasilnya berbeda ≤ 0,83 Hz dari gerakan lama bila arahnya sesuai, dan sampai ±2–6 Hz bila berlawanan. Karena kedua kurva itu hanya tersedia beberapa jam, pemetaan ini diterima.

## Considered Options

- **Segitiga (zigzag lurus)**: ditolak, karena arahnya berbalik mendadak.
- **Plateau lalu lompat**: ditolak. Lompatan Beat memancing respons kebaruan, dan Gnaural justru memakai spike mendadak untuk mencegah pendengar tertidur.
- **Acak ala RAVE (Mind Alive)**: ditolak. Hasilnya tidak bisa direproduksi atau digambar untuk Clinician, dan buktinya hanya klaim produsen.
- **Wave di Hold dengan periode dalam menit**: ditolak untuk sekarang. Butuh parameter jenis kedua, sedangkan bukti habituasi manusia terhadap Beat konstan lemah.

## Consequences

Copy menyebut Wave sebagai variasi Beat, tanpa klaim mencegah habituasi. Studio memberi petunjuk, bukan larangan, bila satu lintasan kurang dari 1 menit (terdengar sebagai wobble) atau ayunan lebih dari 3 Hz. Setiap setengah ayunan dijadwalkan sebagai 32 ramp linear, sama seperti satu gerakan berkurva lainnya.
