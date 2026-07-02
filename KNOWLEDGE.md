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
