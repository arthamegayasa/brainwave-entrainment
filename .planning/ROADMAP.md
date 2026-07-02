# Roadmap: Healing Audio PWA (M001 — MVP Preset Player)

## Overview

Bangun dari bawah ke atas dalam tiga vertical slice: pertama audio engine murni TypeScript yang membuktikan semua jenis suara (binaural, isochronic, monaural, solfeggio, ambient) bisa disintesis bersih tanpa click — sudah bisa didengar lewat tombol play minimal. Kedua, SessionScheduler dan 8 preset tujuan mengubah tone mentah menjadi sesi terpandu (ramp turun → hold → naik, auto-stop dengan fade). Ketiga, player UI goal-first lengkap dengan mixer, timer, dan dark calm theme — user memilih tujuan, bukan frekuensi.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Audio Engine Core** - Engine TypeScript murni: semua mode entrainment + ambient tersintesis, terdengar via tombol play, bebas click
- [ ] **Phase 2: Session Scheduler & Presets** - Kurva ramp per preset, 8 preset tujuan, mode headphone/speaker, auto-stop dengan fade
- [ ] **Phase 3: Player UI & Mixer** - UI goal-first lengkap: kartu preset, durasi, ambient, mixer, timer, panel frekuensi, dark calm theme

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

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Audio Engine Core | 0/TBD | Not started | - |
| 2. Session Scheduler & Presets | 0/TBD | Not started | - |
| 3. Player UI & Mixer | 0/TBD | Not started | - |

## Coverage

22/22 v1 requirements mapped. No orphans, no duplicates.

| Category | Requirements | Phase |
|----------|--------------|-------|
| Audio Engine | ENG-01..ENG-07 | Phase 1 |
| Autoplay/gesture | UI-08 | Phase 1 |
| Session Scheduler | SCH-01..SCH-04 | Phase 2 |
| Presets | PRE-01..PRE-03 | Phase 2 |
| Player UI | UI-01..UI-07 | Phase 3 |
