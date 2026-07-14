# KNOWLEDGE.md — Patterns, Gotchas, Conventions

## Domain: Brainwave Entrainment

- **Binaural beats**: dua tone beda frekuensi di telinga kiri/kanan (L=carrier, R=carrier+beat). Otak mempersepsi selisihnya sebagai "beat". **Wajib headphone/stereo terpisah.** Carrier ideal 100–500 Hz; beat = frekuensi brainwave target.
- **Isochronic tones**: satu tone yang di-pulse on/off pada beat Hz (amplitude modulation). **Bekerja tanpa headphone.** Envelope pulse harus halus (trapezoid/raised-cosine), bukan square — square menghasilkan click.
- **Monaural beats**: dua tone dijumlahkan sebelum sampai ke telinga → beat fisik di udara. Bekerja di speaker.
- **Band brainwave**: Delta 0.5–4 Hz (tidur nyenyak), Theta 4–8 Hz (meditasi dalam, healing), Alpha 8–13 Hz (relaks, anti-cemas), Beta 13–30 Hz (fokus), Gamma 30–100 Hz — umum dipakai 40 Hz (energi, kognisi).
- **Solfeggio frequencies**: 174, 285, 396, 417, 528, 639, 741, 852, 963 Hz. Praktik umum (termasuk EquiSync): dipakai sebagai **carrier** untuk binaural/isochronic, atau pure tone layer. 528 Hz = "healing/DNA repair" (klaim tradisional, bukan medis).
- **Schumann resonance**: 7.83 Hz — populer untuk preset healing/grounding (di border theta/alpha).
- **Ramp logic**: mulai dari frekuensi dekat kondisi sadar (10–14 Hz), turun bertahap (linear/exponential) ke target, hold, lalu ramp naik pelan di akhir sesi agar user tidak "grogi". Preset tidur: tanpa ramp naik.
- **Framing produk**: relaxation & meditation tool. Jangan pakai klaim medis/penyembuhan.

## Web Audio API Gotchas

- **Autoplay policy**: AudioContext mulai dalam state `suspended`; wajib `resume()` dari user gesture (tombol play).
- **Click/pop prevention**: jangan set `gain.value` langsung — selalu `setTargetAtTime`/`linearRampToValueAtTime`. Fade-in/out master minimal ~50ms.
- **Frekuensi ramp**: pakai `oscillator.frequency.linearRampToValueAtTime` atau scheduler per-chunk; jangan re-create oscillator per perubahan.
- **Binaural routing**: `ChannelMergerNode` (L/R) atau dua `StereoPannerNode` (pan -1 / +1).
- **Isochronic**: `GainNode` dimodulasi — paling stabil pakai scheduled envelope curve (`setValueCurveAtTime` per siklus) atau oscillator LFO → `WaveShaperNode` → gain.
- **Noise ambient**: `AudioBufferSourceNode` berisi white noise loop → filter (`BiquadFilterNode` lowpass untuk brown/ocean, bandpass modulated untuk rain/wind).
- **iOS**: audio berhenti saat tab background kecuali ada elemen audio aktif; Media Session API membantu kontrol lockscreen tapi tidak menjamin background synthesis di iOS — dokumentasikan ke user (screen on / add to homescreen).
- **Timer drift**: jangan andalkan `setTimeout` untuk jadwal audio; pakai `AudioContext.currentTime` sebagai clock (pattern "lookahead scheduler", Chris Wilson "A Tale of Two Clocks").

## Conventions

- Bahasa kode/komentar/commit: English. UI: English (diubah dari Indonesia atas permintaan user, 2026-07-03).
- Semua konstanta frekuensi preset di satu file `presets.ts` — mudah di-tweak.
- Audio engine murni TypeScript tanpa dependency React (testable, reusable untuk M003 builder).

## Implementation Learnings (M001, 2026-07-02)

- **Testing Web Audio di Node**: `node-web-audio-api` 2.0.0 memberi `OfflineAudioContext` NYATA — unit test = assertion terhadap sampel yang benar-benar dirender (zero-crossing, RMS envelope, pulse count), bukan mock. Test env Vitest = "node" (bukan jsdom). Cast `as unknown as BaseAudioContext` untuk friksi tipe.
- **Isochronic double-pulse bug**: WaveShaper curve WAJIB monotonic non-decreasing. Curve yang naik-lalu-turun menghasilkan 2× beat Hz. Guard dengan test exact pulse-count (tepat 10, bukan rentang).
- **Clip dari BiquadFilter**: filter resonansi bisa boost > 0 dBFS (rain highpass+lowpass mencapai 1.66). Solusi: trim GainNode per layer + master DynamicsCompressor limiter di SessionEngine & BuilderEngine (juga hearing safety).
- **exponentialRampToValueAtTime(0) throws RangeError** — pakai linearRamp ke 0.0001 lalu setValueAtTime(0), atau setTargetAtTime(0).
- **Ramp beat = ramp satu AudioParam**: arsitektur isochronic LFO→WaveShaper dipilih agar Phase 2 bisa ramp beat Hz (lfo.frequency) kontinu. Binaural/monaural: beat di oscillator kanan/B.
- **Untrusted JSON import**: semua nilai preset yang di-import di-clamp ke rentang aman (freq 20-1500, gain 0-1, name ≤ 60 char) — import = untrusted input.

## Implementation Learnings (quick-260707-a47, 2026-07-07)

- **Trust boundary cloud spec**: setiap `spec` JSONB dari `custom_audios` WAJIB lewat `sanitizeSession` sebelum menyentuh BuilderEngine — sama seperti JSON import. Sanitizer juga membatasi jumlah layer (cap 12; tiap layer = node audio + noise buffer nyata → vektor exhaustion) dan me-regenerate layer id duplikat (BuilderEngine key `live` Map by id; duplikat = layer orphan yang `stop()` tidak bisa jangkau).
- **Dua engine audio = satu pasang telinga**: SessionEngine (preset) dan BuilderEngine (custom) tidak saling tahu. Eksklusivitas ditegakkan di App: `handleStart` memanggil `stopBuilderPlayback()`, dan Library/Builder menerima `onBeforePlay` yang menghentikan sesi preset. Transport custom-audio dilacak module-level (`nowPlaying` di builderEngine.ts) agar remount view merestorasi tombol Stop; `getNowPlaying()` self-heal kasus timed session yang berakhir natural (engine.isRunning tidak pernah turun sendiri).
- **Aritmetika minggu/hari lokal: selalu setDate(), jangan +N×24 jam ms** — DST fall-back membuat minggu lokal 169 jam; penambahan milidetik tetap mendarat 1 jam meleset dan menjatuhkan data di jam terakhir Minggu.
- **State berbasis waktu di React**: nilai turunan waktu (mis. `recommendedPresetId`) harus di-refresh via interval + `visibilitychange`, dan di-resolve ulang di click handler — PWA tab bisa hidup berjam-jam tanpa remount.
- **Kredit sesi timed**: stempel waktu completion memakai scheduled end (`startEpoch + durasi`), bukan waktu callback poll — tab yang di-suspend semalaman jangan mengkredit sesi tidur ke pagi berikutnya. Ref preset aktif di-assign SETELAH `await session.start()` resolve (natural-end sesi lama bisa fire mid-await).
- **`serenade.role.override` hanya untuk mode standalone**: saat `.env.local` berisi VITE_SUPABASE_*, override diabaikan (server profile menang) — dev env repo ini SUDAH configured, jadi menguji override butuh menjalankan tanpa env tersebut.

## Implementation Learnings (quick-260714-a8a, 2026-07-14)

- **Multi-tenant RLS — batasi kolom, bukan hanya baris**: policy `FOR ALL ... created_by = auth.uid()` melindungi kepemilikan baris, TAPI kolom sensitif (mis. `is_template` yang membuat audio kelihatan app-wide) harus dibatasi di `WITH CHECK` — kalau tidak, klinisi bisa PATCH `is_template=true` via PostgREST dan inject konten global. Gate UI (tombol admin-only) tidak cukup; klien bisa hit REST langsung.
- **Orphan lintas-tabel saat link diputus**: `template_visibility`/`audio_assignments` tidak FK ke `patient_links`, dan policy klinisi butuh link EKSIS di USING-nya — jadi begitu link dihapus, tak seorang pun bisa membersihkan orphan (preset tetap hidden selamanya, akses audio tetap ada). Solusi: `AFTER DELETE` trigger (security definer) yang meng-cascade apa yang skema tak bisa ekspresikan.
- **Redeem single-use butuh row lock**: `SELECT ... FOR UPDATE` pada baris kode invite men-serialize redeem konkuren; tanpa itu dua pasien bisa lolos cek `used_by IS NULL` bersamaan (unique(patient_id) tidak menabrak karena beda pasien).
- **Lifecycle langganan — jangan cabut buta**: webhook failure branch HARUS cek `provider_ref` cocok dengan entitlement aktif sebelum revoke — Midtrans mengirim `expire` untuk order yang di-abandon ~24 jam kemudian, dan tanpa cek ini order baru yang ditinggalkan mencabut langganan yang sudah dibayar dari order LAIN. Juga: `create-transaction` jangan turunkan entitlement aktif ke pending saat checkout baru dibuka.
- **Role tracks plan dibayar**: promosi/demosi role harus dua arah — bayar clinician → promote, bayar premium (lebih murah) → demote clinician→user. Selalu guard `.eq('role', ...)` agar admin tak tersentuh.
- **Cross-instance state di React tanpa store**: `useEntitlement` per-instance (App nav vs Upgrade page pakai instance beda). Perubahan role server-side setelah bayar tidak muncul di nav sampai reload — kecuali di-broadcast via `supabase.auth.refreshSession()` yang memicu `onAuthStateChange` di SEMUA instance sekaligus.
- **Konsistensi band**: `preset.band` (kurItorial) harus === `bandForHz(targetHz)` (derivasi) — kalau tidak, frekuensi sama tampil beda label antara Home dan Audio Bank. Dijaga test invarian atas semua preset.
- **Deploy edge function via MCP**: pertahankan `verify_jwt` per-function (create-transaction true, webhook false — webhook auth via signature SHA-512, bukan JWT).
