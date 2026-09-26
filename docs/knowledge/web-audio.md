# Web Audio

Gotcha untuk `src/audio/`, `src/ui/audioContext.ts`, kedua engine, dan ekspor MP3.

## Dasar

- **Autoplay policy**: AudioContext mulai dalam state `suspended`; wajib `resume()` dari user gesture (tombol play).
- **Frekuensi ramp**: pakai `oscillator.frequency.linearRampToValueAtTime` atau scheduler per-chunk; jangan re-create oscillator per perubahan.
- **Binaural routing**: `ChannelMergerNode` (L/R) atau dua `StereoPannerNode` (pan -1 / +1).
- **Isochronic**: `GainNode` dimodulasi — paling stabil pakai scheduled envelope curve (`setValueCurveAtTime` per siklus) atau oscillator LFO → `WaveShaperNode` → gain.
- **Noise ambient**: `AudioBufferSourceNode` berisi white noise loop → filter (`BiquadFilterNode` lowpass untuk brown/ocean, bandpass modulated untuk rain/wind).
- **iOS**: Web Audio default-nya di audio session `ambient` → **silent switch membisukan app**; set `navigator.audioSession.type = "playback"` (Safari 16.4+) sebelum membuat context dan di setiap play. Audio tetap bisa di-suspend saat tab background/lock screen; Media Session API membantu kontrol lockscreen tapi tidak menjamin background synthesis di iOS — dokumentasikan ke user (screen on / add to homescreen).

## Layer & sintesis

- **Isochronic double-pulse bug**: WaveShaper curve WAJIB monotonic non-decreasing. Curve yang naik-lalu-turun menghasilkan 2× beat Hz. Guard dengan test exact pulse-count (tepat 10, bukan rentang).
- **Clip dari BiquadFilter**: filter resonansi bisa boost > 0 dBFS (rain highpass+lowpass mencapai 1.66). Solusi: trim GainNode per layer + master DynamicsCompressor limiter di SessionEngine & BuilderEngine (juga hearing safety).
- **exponentialRampToValueAtTime(0) throws RangeError** — pakai linearRamp ke 0.0001 lalu setValueAtTime(0), atau setTargetAtTime(0).
- **Ramp beat = ramp satu AudioParam**: arsitektur isochronic LFO→WaveShaper dipilih agar Phase 2 bisa ramp beat Hz (lfo.frequency) kontinu. Binaural/monaural: beat di oscillator kanan/B.
- **Noise harus sample-rate invariant**: konstanta per-sample (koefisien leaky integrator brown, amplitudo white) diam-diam mengubah suara per device. Leak `a = 1.02^(−44100/fs)` menjaga corner ~139 Hz tetap; amplitudo white × `sqrt(fs/44100)` menjaga daya per-Hz. Sebelum fix: ±2.4–3.4 dB beda di 22.05k/96k. Test `bandLevels` mengukur band 125/500/2000 Hz di 22.05/48/96/192 kHz (±1 dB). 16 kHz sengaja dikecualikan: warping bilinear lowpass 7 kHz rain di dekat Nyquist = ~1 dB, batas fisik rate.
- **Bangun graph dulu, baru baca `currentTime`**: pembuatan noise buffer memakan waktu main-thread (puluhan ms di device lemah) sementara audio thread terus jalan; timestamp yang diambil lebih dulu sudah lewat saat source start → fade-in terpotong (klik), terutama swap ambience live dan edit layer Studio.

## AudioContext bersama & lifecycle perangkat

- **Satu AudioContext, dimiliki UI glue**: `src/ui/audioContext.ts` (`acquireAudio(owner)` / `releaseAudio(owner)`) — SessionEngine & BuilderEngine berbagi satu context. Panggil `acquireAudio` SINKRON di dalam gesture; jangan `await ctx.resume()` (di iOS bisa tidak pernah settle → tombol Start mati). Engine boleh menjadwal di clock yang sedang pause: semuanya berbunyi saat context `running`.
- **Interupsi = pause di tempat**: semua timing di audio clock, jadi telepon/alarm/lock screen membekukan sesi di posisinya. Retry `resume()` pada `statechange`, `visibilitychange`, `pageshow`, `focus`, dan setiap `pointerdown`/`keydown`/`touchend` (capture); banner "Resume audio" hanya bila device menahan pause setelah pernah `running`, atau start belum `running` setelah grace 1.5 s (tanpa grace, transisi normal suspended→running akan mem-flash banner).
- **Suspend saat idle**: context yang dibiarkan `running` me-render silence selamanya (baterai + memegang audio session iOS). Suspend 1.5 s setelah owner terakhir release (menunggu fade stop selesai). BuilderEngine tidak punya `onEnded` → `ensureBuilder` memasang interval 1 s yang memanggil `getNowPlaying()` agar natural end tetap me-release walau user sudah pindah view.
- **Pause = `ctx.suspend()`**: semua timing di audio clock, jadi suspend membekukan ramp, fade, dan akhir sesi tepat di tempat. Flag `userPaused` di `audioContext.ts` WAJIB membuat auto-resume (gesture/visibility/statechange) dan banner "Resume audio" diam — tanpa itu tap berikutnya di mana pun langsung membatalkan pause. Lock screen: Media Session `pause`/`play` → `pauseAudio`/`resumeAudio`, `playbackState` mengikuti. Handler ini hanya terpakai bila ada elemen media yang sedang diputar: tanpa itu browser tidak menampilkan Media controls sama sekali (ADR-024).

## Engine, transport & waktu sesi

- **Dua engine audio = satu pasang telinga**: SessionEngine (preset) dan BuilderEngine (custom) tidak saling tahu. Eksklusivitas ditegakkan di App: `handleStart` memanggil `stopBuilderPlayback()`, dan Library/Builder menerima `onBeforePlay` yang menghentikan sesi preset. Transport custom-audio dilacak module-level (`nowPlaying` di builderEngine.ts) agar remount view merestorasi tombol Stop; `getNowPlaying()` self-heal kasus timed session yang berakhir natural (engine.isRunning tidak pernah turun sendiri).
- **Kepemilikan transport builder**: `setNowPlaying(id)` dengan id lain = item sebelumnya "stopped" (Studio, item lain, atau preset mengambil alih); `getNowPlaying()` yang melihat sisa waktu habis = akhir alami. `onBuilderPlaybackEnd` melaporkannya sekali, bahkan saat Library tidak ter-mount. Studio tidak pernah dicatat karena adapter hanya mengikuti id yang dimulai Library.
- **Kredit sesi timed**: stempel waktu completion memakai scheduled end (`startEpoch + durasi`), bukan waktu callback poll — tab yang di-suspend semalaman jangan mengkredit sesi tidur ke pagi berikutnya. Sejak 2026-09-25 `session.start()` sinkron (tidak menunggu `resume()`), jadi tidak ada celah await di mana natural-end sesi lama bisa menyalip ref preset baru.
- **Waktu selesai dari audio clock**: `endedAt = now − (elapsed − durasi)` saat poll mendeteksi akhir. Menggantikan `startEpoch + durasi` yang salah begitu ada pause/interupsi, dan tetap kebal terhadap poll yang di-throttle berjam-jam.
- **Waktu dengar = waktu AudioContext `running`**: kedua engine berbagi satu context, jadi adapter di `src/ui/playAdapters.ts` mem-pause/resume recorder mengikuti `ctx.state` (`isAudioRunning()` via `subscribeAudio`), bukan tombol Pause saja. Pause User, telepon, dan start yang belum di-resume device semuanya tidak terhitung. Akhir alami diberi tanggal saat seluruh panjang sudah terdengar (dihitung recorder), bukan saat poll yang di-throttle akhirnya melihatnya.

## Ekspor MP3

- **Ekspor MP3 dari engine sintesis**: BuilderEngine context-agnostic → render `OfflineAudioContext` (44.1kHz stereo) lalu encode `@breezystack/lamejs` 320kbps per blok 1152 sample dengan yield event-loop; fork breezystack dipakai karena lamejs asli pecah di bundler modern ('MPEGMode is not defined'). Sanitasi nama file: strip dash pinggir + fallback — nama full non-ASCII menghasilkan "-.mp3".
- **Ekspor preset = SessionEngine offline**: kurva, mix, volume mixer user, fade, dan limiter identik dengan live. Mode speaker identik di kedua telinga → render mono (setengah memori), `encodeMp3` menduplikasi. Mode headphone WAJIB stereo (beat binaural = selisih L/R). Diverifikasi di MP3 hasil: L 527.98 Hz / R 537.32 Hz pada menit 1 Meditating. CBR 320 kbps → ukuran file = durasi × bitrate (15 menit = 36.0 MB), dipakai E2E sebagai bukti panjang penuh.
- **State single-flight yang harus selamat dari remount**: state React per-komponen hilang saat tab/view berganti — untuk operasi berat berjalan-lama (render MP3 ~1GB), flag single-flight WAJIB module-level dan di-guard di handler-nya sendiri (bukan hanya atribut `disabled`), dengan listener yang me-re-sync instance komponen yang sedang mounted. Sejak 2026-09-25 ekspor MP3 memakai satu store app-wide (`src/ui/mp3Export.ts`, `runMp3Export`) untuk Audio Bank DAN preset — dua render paralel = dua buffer ~1.3 GB.
