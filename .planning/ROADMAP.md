# Roadmap: Healing Audio PWA (M001 — Full Public Product, per ADR-007)

## Overview

Bangun dari bawah ke atas dalam lima vertical slice: (1) audio engine murni TypeScript yang membuktikan semua jenis suara bisa disintesis bersih; (2) SessionScheduler dan 8 preset tujuan (ramp turun → hold → naik, auto-stop); (3) player UI goal-first premium dengan mixer, timer, visualisasi; (4) advanced session builder ala EquiSync Element (multi-layer, frequency finder, ramp editor, export/import); (5) public launch readiness — landing page, halaman science/research bercitasi, PWA offline, Media Session, persistence, dan arsitektur monetization-ready (free/premium gating tanpa payment live).

## Phases

**Phase Numbering:**
- Integer phases (1..5): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Audio Engine Core** - Engine TypeScript murni: semua mode entrainment + ambient tersintesis, terdengar via tombol play, bebas click
- [ ] **Phase 2: Session Scheduler & Presets** - Kurva ramp per preset, 8 preset tujuan, mode headphone/speaker, auto-stop dengan fade
- [ ] **Phase 3: Player UI & Mixer** - UI goal-first premium: kartu preset, durasi, ambient, mixer, timer, panel frekuensi, visualisasi, dark calm theme
- [ ] **Phase 4: Advanced Session Builder** - Multi-layer editor, frequency finder, ramp editor custom, save/export/import preset
- [ ] **Phase 5: Public Launch & Monetization-Ready** - Landing page, halaman Science bercitasi, PWA offline, Media Session, persistence, free/premium scaffold

## Phase Details

### Phase 1: Audio Engine Core
**Goal**: User dapat menekan tombol play dan mendengar setiap jenis suara tersintesis (binaural, isochronic, monaural, solfeggio, ambient) dengan bersih — membuktikan fondasi audio bekerja end-to-end
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: ENG-01, ENG-02, ENG-03, ENG-04, ENG-05, ENG-06, ENG-07, UI-08
**Success Criteria** (what must be TRUE):
  1. User menekan tombol play (user gesture — AudioContext resume, lolos autoplay policy) dan mendengar binaural beat dengan tone berbeda di telinga kiri/kanan
  2. User dapat berganti ke isochronic tones dan monaural beats dan mendengarnya tanpa click/pop — termasuk pada envelope pulse isochronic
  3. User dapat mendengar solfeggio frequency (sebagai carrier atau pure-tone layer) dan keempat ambient tersintesis: rain, ocean, wind, brown noise
  4. Semua play/stop dan perubahan gain ter-fade halus (ramp, bukan set langsung) — tidak ada click/pop yang terdengar
  5. Modul audio engine tidak meng-import React sama sekali dan lulus unit test
**Plans**: TBD

### Phase 2: Session Scheduler & Presets
**Goal**: User dapat memulai sesi dari salah satu 8 preset tujuan dan otaknya "dituntun" otomatis — frekuensi beat mengikuti kurva ramp preset hingga sesi berakhir sendiri dengan fade-out
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: SCH-01, SCH-02, SCH-03, SCH-04, PRE-01, PRE-02, PRE-03
**Success Criteria** (what must be TRUE):
  1. User dapat memulai salah satu dari 8 preset tujuan (Deep Sleep, Deep Meditation, Healing & Relaxation, Anxiety Relief, Focus, Energy, Creativity, Power Nap) dan frekuensi beat turun dari ±kondisi sadar → target → hold → naik di akhir sesuai kurva preset
  2. Preset bertipe tidur (Deep Sleep) berakhir di frekuensi rendah tanpa ramp naik
  3. Sesi berhenti otomatis saat durasi habis dengan fade-out halus; mode ∞ berjalan terus sampai user menekan stop
  4. User dapat memilih mode Headphone (binaural) atau Speaker (isochronic) per sesi, dengan penjelasan singkat bedanya
  5. Jadwal frekuensi tetap akurat sepanjang sesi (clock berbasis AudioContext.currentTime — tidak drift meski tab tidak fokus)
**Plans**: TBD

### Phase 3: Player UI & Mixer
**Goal**: User dapat menjalankan seluruh alur sesi dari UI goal-first yang tenang — pilih tujuan → durasi → ambient → play — dengan kontrol mixer, timer, dan detail frekuensi opsional, tanpa perlu paham Hz
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, UI-07
**Success Criteria** (what must be TRUE):
  1. User memilih tujuan dari kartu preset visual dan durasi (15/30/45/60 menit/∞) tanpa melihat satu angka Hz pun di alur utama
  2. User dapat memilih/mengganti ambient layer sebelum maupun selama sesi berjalan tanpa memutus sesi
  3. User dapat mengatur volume per layer (entrainment, solfeggio, ambient) dan master volume selama playback dengan respons halus tanpa click
  4. User melihat timer countdown dan status sesi berjalan, dan dapat membuka panel detail frekuensi (beat Hz saat ini, carrier, fase ramp)
  5. UI dark calm theme tampil benar mobile-first di HP dan tetap rapi di desktop
**Plans**: TBD
**UI hint**: yes

### Phase 4: Advanced Session Builder
**Goal**: Power user dapat merakit sesi custom multi-layer seperti di EquiSync Element — tiap layer dengan metode entrainment, carrier, dan beat sendiri, kurva ramp custom, dibantu frequency finder — lalu menyimpan/membagikannya
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: BLD-01, BLD-02, BLD-03, BLD-04
**Success Criteria** (what must be TRUE):
  1. User dapat menambah/menghapus layer dan memilih metode entrainment (binaural/isochronic/monaural/pure), carrier Hz, dan beat Hz per layer — lalu mendengarnya live
  2. Frequency finder menyarankan frekuensi harmonis (oktaf, harmonic series, solfeggio terdekat) dari base frequency yang diketik user
  3. User dapat mengatur kurva ramp custom (start → target → hold → end) dan sesi berjalan mengikutinya
  4. Custom preset dapat disimpan (localStorage), dimuat ulang, di-export ke JSON, dan di-import kembali
**Plans**: TBD
**UI hint**: yes

### Phase 5: Public Launch & Monetization-Ready
**Goal**: Aplikasi siap dipakai orang banyak dan siap dimonetisasi — landing page meyakinkan, halaman science bercitasi jujur, installable sebagai PWA offline, kontrol dari lockscreen, preferensi tersimpan, dan struktur free/premium siap disambungkan ke payment provider
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: LND-01, RES-01, MON-01, PWA-01, PWA-02, PWA-03, PWA-04
**Success Criteria** (what must be TRUE):
  1. Landing page menjelaskan value proposition + cara kerja dan mengarahkan ke player; halaman Science menampilkan sitasi studi nyata dengan framing jujur (bukan klaim medis)
  2. App installable sebagai PWA dan tetap berfungsi offline (app shell + audio synthesized lokal)
  3. Play/pause dapat dikontrol dari lockscreen/OS via Media Session API dengan metadata sesi
  4. Volume, preset terakhir, dan custom preset bertahan setelah reload (localStorage)
  5. Feature flag free/premium terpusat + halaman upgrade tampil; semua fitur unlocked di build ini (payment live = v2)
  6. Visualisasi kurva frekuensi sesi berjalan tampil interaktif di player
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Audio Engine Core | 0/TBD | Not started | - |
| 2. Session Scheduler & Presets | 0/TBD | Not started | - |
| 3. Player UI & Mixer | 0/TBD | Not started | - |
| 4. Advanced Session Builder | 0/TBD | Not started | - |
| 5. Public Launch & Monetization-Ready | 0/TBD | Not started | - |

## Coverage

33/33 v1 requirements mapped. No orphans, no duplicates.

| Category | Requirements | Phase |
|----------|--------------|-------|
| Audio Engine | ENG-01..ENG-07 | Phase 1 |
| Autoplay/gesture | UI-08 | Phase 1 |
| Session Scheduler | SCH-01..SCH-04 | Phase 2 |
| Presets | PRE-01..PRE-03 | Phase 2 |
| Player UI | UI-01..UI-07 | Phase 3 |
| Advanced Builder | BLD-01..BLD-04 | Phase 4 |
| Launch & Monetization | LND-01, RES-01, MON-01, PWA-01..PWA-04 | Phase 5 |
