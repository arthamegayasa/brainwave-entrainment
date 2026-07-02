# REQUIREMENTS.md — Healing Audio PWA v1 (M001, expanded per ADR-007)

## v1 Requirements

### Audio Engine

- [ ] **ENG-01**: User dapat mendengar binaural beats (dua oscillator L/R: carrier & carrier+beat) yang disintesis real-time via Web Audio API
- [ ] **ENG-02**: User dapat mendengar isochronic tones (tone di-pulse pada beat Hz dengan envelope halus, tanpa click)
- [ ] **ENG-03**: User dapat mendengar monaural beats (dua tone dijumlah sebelum output)
- [ ] **ENG-04**: User dapat mendengar solfeggio frequency sebagai carrier entrainment atau pure-tone layer
- [ ] **ENG-05**: User dapat mendengar ambient layer tersintesis: rain, ocean, wind, brown noise
- [ ] **ENG-06**: Semua perubahan gain memakai ramp (tanpa click/pop); play/stop dengan fade-in/out halus
- [ ] **ENG-07**: Audio engine adalah modul TypeScript murni tanpa dependency React (unit-testable)

### Session Scheduler

- [ ] **SCH-01**: Frekuensi beat mengikuti kurva ramp per preset (turun dari ±kondisi sadar → target → hold → naik di akhir)
- [ ] **SCH-02**: Preset tidur berakhir tanpa ramp naik (dibiarkan di frekuensi rendah)
- [ ] **SCH-03**: Penjadwalan memakai AudioContext.currentTime sebagai clock (bukan setTimeout) — bebas drift
- [ ] **SCH-04**: Sesi berhenti otomatis saat durasi habis, dengan fade-out; mode ∞ berjalan terus sampai user stop

### Presets

- [ ] **PRE-01**: Tersedia 8 preset tujuan: Deep Sleep, Deep Meditation, Healing & Relaxation, Anxiety Relief, Focus, Energy, Creativity, Power Nap
- [ ] **PRE-02**: Setiap preset mendefinisikan: target beat Hz, carrier (solfeggio), kurva ramp, ambient default — terpusat di satu file konstanta
- [ ] **PRE-03**: User dapat memilih mode Headphone (binaural) atau Speaker (isochronic) per sesi; app menjelaskan bedanya

### Player UI

- [ ] **UI-01**: User dapat memilih tujuan dari kartu preset visual (tanpa perlu paham Hz)
- [ ] **UI-02**: User dapat memilih durasi sesi: 15 / 30 / 45 / 60 menit / ∞
- [ ] **UI-03**: User dapat memilih/mengganti ambient layer sebelum & selama sesi
- [ ] **UI-04**: User dapat mengatur volume per layer (entrainment, solfeggio, ambient) + master volume
- [ ] **UI-05**: User melihat timer countdown dan status sesi berjalan
- [ ] **UI-06**: User dapat membuka panel detail frekuensi (beat Hz saat ini, carrier, fase ramp)
- [ ] **UI-07**: UI dark calm theme premium, mobile-first, responsive di HP & desktop, interaktif (animasi halus, feedback visual saat sesi berjalan)
- [ ] **UI-08**: Play dimulai dari user gesture (AudioContext resume) — bekerja di browser dengan autoplay policy

### Advanced Builder (ala EquiSync Element)

- [ ] **BLD-01**: User dapat membuat sesi custom multi-layer: tambah/hapus layer, tiap layer pilih metode entrainment (binaural/isochronic/monaural/pure), carrier Hz, beat Hz
- [ ] **BLD-02**: Frequency finder: dari base frequency, app menyarankan frekuensi harmonis/berkorelasi (oktaf, harmonic series, solfeggio terdekat)
- [ ] **BLD-03**: User dapat mengatur kurva ramp sesi custom (titik-titik fase: start → target → hold → end)
- [ ] **BLD-04**: User dapat menyimpan, memuat, export/import preset custom (JSON + localStorage)

### Public Launch & Monetization-Ready

- [ ] **LND-01**: Landing page publik: value proposition, cara kerja, CTA ke player — profesional & meyakinkan
- [ ] **RES-01**: Halaman Science/Research: penjelasan brainwave entrainment dengan sitasi studi nyata, framing jujur (relaxation tool, bukan klaim medis)
- [ ] **MON-01**: Arsitektur free/premium tier: feature flag terpusat, komponen gating, halaman upgrade — payment processing stub (tanpa Stripe live; semua fitur unlocked di build ini)
- [ ] **PWA-01**: Installable PWA + offline (vite-plugin-pwa)
- [ ] **PWA-02**: Media Session API — metadata & kontrol play/pause dari lockscreen/OS
- [ ] **PWA-03**: Preferensi & tweak user tersimpan di localStorage (volume, preset terakhir, custom presets)
- [ ] **PWA-04**: Visualisasi sesi berjalan: kurva frekuensi + posisi saat ini (interaktif)

## v2 Requirements (deferred)

- Payment processing live (Stripe) + akun user + backend — butuh kredensial user
- Analytics & SEO tooling lanjutan
- Background music generatif (pad/drone)
- Bilingual UI penuh (EN/ID switcher)

## Out of Scope

- Klaim medis/penyembuhan — framing relaxation tool (tetap)
- Audio file/streaming — semua synthesized (ADR-004)
- Cloud sync — tanpa backend di v1

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ENG-01 | Phase 1 | Pending |
| ENG-02 | Phase 1 | Pending |
| ENG-03 | Phase 1 | Pending |
| ENG-04 | Phase 1 | Pending |
| ENG-05 | Phase 1 | Pending |
| ENG-06 | Phase 1 | Pending |
| ENG-07 | Phase 1 | Pending |
| UI-08 | Phase 1 | Pending |
| SCH-01 | Phase 2 | Pending |
| SCH-02 | Phase 2 | Pending |
| SCH-03 | Phase 2 | Pending |
| SCH-04 | Phase 2 | Pending |
| PRE-01 | Phase 2 | Pending |
| PRE-02 | Phase 2 | Pending |
| PRE-03 | Phase 2 | Pending |
| UI-01 | Phase 3 | Pending |
| UI-02 | Phase 3 | Pending |
| UI-03 | Phase 3 | Pending |
| UI-04 | Phase 3 | Pending |
| UI-05 | Phase 3 | Pending |
| UI-06 | Phase 3 | Pending |
| UI-07 | Phase 3 | Pending |
| BLD-01 | Phase 4 | Pending |
| BLD-02 | Phase 4 | Pending |
| BLD-03 | Phase 4 | Pending |
| BLD-04 | Phase 4 | Pending |
| LND-01 | Phase 5 | Pending |
| RES-01 | Phase 5 | Pending |
| MON-01 | Phase 5 | Pending |
| PWA-01 | Phase 5 | Pending |
| PWA-02 | Phase 5 | Pending |
| PWA-03 | Phase 5 | Pending |
| PWA-04 | Phase 5 | Pending |

**Coverage: 33/33 v1 requirements mapped — no orphans, no duplicates.**
