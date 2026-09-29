# ADR-028: Journey Custom Audio sebagai titik-titik dengan satu Hold (2026-09-29)

Owner meminta Journey di Studio tidak lagi terkunci pada Start, Target, dan End: Beat bergerak dari Start melewati titik-titik yang ditambahkan satu per satu, masing-masing dicapai sekian menit setelah titik sebelumnya dengan kurvanya sendiri (Linear, S-curve, cepat lalu lambat, lambat lalu cepat), dan menitnya boleh mengisi satu Play penuh (sampai 60 menit per gerakan, Play berwaktu terpanjang). Custom Audio tetap tidak menyimpan panjang: User memilih panjang saat Play. Karena itu satu titik ditandai **Hold**: titik sampai Hold dihitung dari awal, titik sesudahnya dihitung mundur dari akhir, dan Hold mengisi waktu di antaranya. Play yang lebih pendek dari total gerakan menjalankan semua gerakan lebih cepat secara proporsional, jadi penutup (mis. kembali ke Beat sadar) tetap tepat di akhir; Play tanpa batas bergerak sampai Hold lalu menahannya. Spec version 2 menyimpan `journey` (`startHz`, `points[]` dengan `hz`/`minutes`/`easing`, `holdAt`); `sanitizeSession` membaca `curve` version 1 sebagai Journey yang memutarnya (Target lalu Hold, End sebagai penutup), sehingga sesi tersimpan, spec Audio Bank, dan file ekspor lama tetap bisa diputar tanpa migration. Preset tidak berubah: tetap memakai kurva ADR-006 dan batas 40%/20%-nya.

## Considered Options

- **Memotong Journey di akhir Play yang lebih pendek**: ditolak; penutup yang membangunkan User hilang, padahal itu inti ramp ADR-006.
- **Meregangkan seluruh Journey ke panjang Play**: ditolak; Play 60 menit dari Journey 15 menit membuat turun ke target memakan 40 menit.
- **Batas 40% (gerak awal) dan 20% (penutup) seperti Preset**: ditolak owner; gerakan tidak bisa memakai seluruh Play.

## Consequences

Klien versi lama yang masih terbuka tidak mengenali spec version 2 dan menyembunyikan Custom Audio itu sampai halaman dimuat ulang (navigasi PWA selalu ke jaringan dulu). Gerakan berkurva dijadwalkan sebagai 32 potongan linear per gerakan (`beatPath`), di bawah 0,1% dari lebar gerakan dari kurva sebenarnya; chart Studio menggambar potongan yang sama.
