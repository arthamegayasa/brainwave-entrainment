# Serenade — Healing Audio PWA

Sesi audio brainwave-entrainment yang disintesis real-time di browser: **binaural beats, isochronic tones, monaural beats, solfeggio, dan suasana alam** (hujan, ombak, angin, brown noise). Pendekatan **goal-first** — pilih tujuan (Tidur Nyenyak, Meditasi, Fokus, dll), bukan angka Hz. Terinspirasi EquiSync Element, tapi dirancang untuk lebih ramah dan lebih bagus.

> Alat relaksasi & meditasi — **bukan** perangkat medis. Lihat halaman **Sains** untuk framing bukti yang jujur.

## Fitur

- **8 preset tujuan** dengan kurva ramp frekuensi (turun → hold → naik; preset tidur tetap rendah).
- **Studio** — builder multi-layer (metode/carrier/beat per layer), frequency finder harmonis, kurva custom, save/export/import.
- **Audio 100% disintesis** via Web Audio API — frekuensi presisi, durasi bebas, offline penuh, tanpa file audio.
- **PWA** installable + offline, Media Session (kontrol lockscreen), preferensi tersimpan, visualisasi kurva sesi live.
- **Halaman Sains** dengan sitasi studi asli (3 tingkat bukti: terdukung / menjanjikan / tradisi).
- **Monetization-ready**: arsitektur free/premium tier + halaman upgrade (payment stub — semua fitur unlocked di build ini).

## Stack

Vite 8 · React 19 · TypeScript · Vitest (+ `node-web-audio-api` untuk render assertion nyata) · vite-plugin-pwa. Audio engine adalah modul TypeScript murni tanpa dependency React (unit-testable, reusable).

## Menjalankan

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 57 unit test (render OfflineAudioContext nyata)
npm run build    # produksi + service worker PWA
npm run preview  # serve hasil build
```

**Gunakan headphone** untuk mode binaural.

## Arsitektur

```
src/audio/        # engine murni TS (no React)
  ramps.ts        # disiplin gain-ramp (anti-click)
  layers/         # binaural, isochronic, monaural, solfeggio, ambient
  noise.ts        # white/brown noise generator (loop seam crossfade)
  presets.ts      # 8 preset — semua konstanta frekuensi terpusat
  schedule.ts     # kurva ramp → jadwal beat pada audio clock
  session.ts      # SessionEngine (preset player)
  builder.ts      # BuilderEngine (Studio multi-layer)
  freqfinder.ts   # saran frekuensi harmonis
src/state/        # prefs, tier (monetization), customPresets (localStorage)
src/ui/           # Landing, Home, Player, Builder, Science, Upgrade, viz
```

## Roadmap (v2)

Payment live (Stripe) + akun + backend · analytics/SEO lanjutan · background music generatif · bilingual UI. Lihat `ROADMAP.md` & `.planning/`.
