# ADR-024: Media controls lewat elemen audio hening; audio focus eksklusif (2026-09-27)

Browser hanya menampilkan Media controls (notifikasi Android, lock screen iOS) untuk elemen `<audio>`/`<video>` yang sedang diputar, tidak untuk Web Audio ([Chrome](https://developer.chrome.com/blog/media-notifications)). Selama audio diputar, SwaraSanti memutar elemen `<audio>` berisi WAV hening (dibuat saat runtime, ≥ 5 detik, loop, tidak di-mute) di samping AudioContext, tanpa menyambungkannya ke graph Web Audio: suara tetap keluar langsung dari oscillator, jadi frekuensi carrier dan beat persis seperti yang disintesis. Elemen itu yang memegang audio focus, sehingga focus-nya eksklusif: memulai Play menghentikan musik app lain, dan telepon atau app lain mem-pause Play, sama seperti sesi `playback` iOS di ADR-013.

## Considered Options

- **Output Web Audio dialirkan lewat `MediaStreamAudioDestinationNode` ke `<audio>`**: ditolak sebagai jalur utama karena menyisipkan satu jalur lagi antara sintesis dan speaker yang belum terbukti di iOS. Hanya cadangan bila elemen hening gagal di perangkat uji, dan frekuensinya wajib dibuktikan tetap sama.
- **Bercampur dengan musik app lain**: ditolak. Chrome Android hanya meminta audio focus penuh, dan hanya menampilkan notifikasi, untuk media berdurasi ≥ 5 detik ([web.dev](https://web.dev/articles/media-session)).
