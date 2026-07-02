# REQUIREMENTS.md — Healing Audio PWA v1 (M001)

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
- [ ] **UI-07**: UI dark calm theme, mobile-first, responsive di HP & desktop
- [ ] **UI-08**: Play dimulai dari user gesture (AudioContext resume) — bekerja di browser dengan autoplay policy

## v2 Requirements (deferred — M002/M003)

- **PWA-01**: Installable PWA + offline (vite-plugin-pwa)
- **PWA-02**: Media Session API — kontrol dari lockscreen
- **PWA-03**: Simpan tweak user per preset (localStorage)
- **PWA-04**: Visualisasi kurva frekuensi sesi berjalan
- **BLD-01**: Multi-layer editor (advanced builder ala Element)
- **BLD-02**: Frequency finder harmonis
- **BLD-03**: Session shape editor + legs
- **BLD-04**: Export/import preset JSON

## Out of Scope

- Akun, subscription, backend, cloud sync — pemakaian pribadi (ADR-003)
- Audio file/streaming — semua synthesized (ADR-004)
- Klaim medis/penyembuhan — framing relaxation tool
- Background music generatif — backlog

## Traceability

(Filled by roadmap)
