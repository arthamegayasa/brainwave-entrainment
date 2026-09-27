# ADR-026: Ambient alam dari loop rekaman, bukan sintesis noise (2026-09-27)

Men-supersede ADR-004 khusus untuk ambient. Owner menilai Rain, Ocean, dan Wind dari filtered noise belum cukup premium dan nyaman untuk Patient, lalu memilih ambient hasil generate ElevenLabs (text-to-sound-effects) setelah mendengarkan kandidatnya. Rain, Ocean, Wind, dan tiga ambient baru (Stream, Forest, Night) kini diputar dari loop 30 detik di `src/assets/ambient/`: MP3 yang dinormalkan ke −16 LUFS dengan true peak ≤ −1 dBTP (Night mono). Brown Noise, tone entrainment, dan solfeggio tetap disintesis, jadi presisi frekuensi dan ramp kontinu ADR-004 tidak berubah. Service worker mem-precache loop-nya (±4 MB) sehingga semua ambient tetap bisa diputar offline. Kandidat Fireplace dibuang saat review karena letupan kerasnya bisa mengagetkan Patient.

Loop tidak diputar apa adanya: `createShuffledLoopLayer` memutar segmen 10–16 detik dari titik acak di rekaman, disambung crossfade equal-power 3 detik, tanpa pernah melewati ujung rekaman. Rekaman 30 detik dengan ombak besar atau kicauan khas tidak terdengar berulang setiap 30 detik, dan sambungan loop MP3 tidak pernah diputar.

## Considered Options

- **Memperbaiki sintesis noise**: ditolak owner; filtered noise tidak mencapai kualitas suara alam asli.
- **Memutar rekaman dengan `loop = true`**: ditolak. Pola 30 detik terdengar berulang ±60 kali dalam sesi 30 menit, dan sambungannya bisa berbunyi klik di browser yang menambah padding encoder MP3.

## Consequences

Pada volume Ambient yang sama, ambient baru ±3 dB lebih pelan dari Brown Noise dan ±8 dB lebih pelan dari Rain sintetis lama. Ambient yang belum selesai di-decode saat Start masuk perlahan begitu siap; ekspor MP3 men-decode loop sebelum render offline. Pemakaian komersial output ElevenLabs bergantung pada paket langganan owner.
