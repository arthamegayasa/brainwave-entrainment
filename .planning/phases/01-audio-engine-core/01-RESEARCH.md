# Phase 1: Audio Engine Core - Research

**Researched:** 2026-07-02
**Domain:** Web Audio API synthesis (binaural/isochronic/monaural/solfeggio/ambient) + Vite/React/TS/Vitest scaffold
**Confidence:** HIGH (stack & testing diverifikasi empiris; parameter ambient bertanda ASSUMED)

## Summary

Fase ini membangun walking skeleton: scaffold Vite + React + TS, engine audio TypeScript murni, dan UI play minimal yang membunyikan kelima jenis suara. Temuan kunci riset: **strategi testing terpecahkan secara definitif** — package `node-web-audio-api` (IRCAM, Rust-backed) menyediakan `OfflineAudioContext` NYATA di Node.js Windows, sudah saya verifikasi empiris di mesin ini: render binaural stereo (L≈200 Hz / R≈210 Hz terukur via zero-crossing), `setValueCurveAtTime`, WaveShaper modulation, dan exception `exponentialRampToValueAtTime(0)` semuanya bekerja sesuai spec. Artinya unit test engine bisa berupa **assertion terhadap audio yang benar-benar dirender**, bukan mock — jauh lebih bermakna daripada `standardized-audio-context-mock`.

Konsekuensi arsitektur dari temuan ini: engine WAJIB menerima `BaseAudioContext` via constructor injection (bukan membuat `new AudioContext()` sendiri di module scope). Ini sekaligus memenuhi ENG-07 (pure TS, unit-testable) dan UI-08 (context dibuat/di-resume dari user gesture di lapisan React).

Untuk isochronic (ENG-02), rekomendasi: **LFO OscillatorNode → WaveShaperNode → gain.gain** (audio-rate modulation). Alasan menentukan: Phase 2 mewajibkan beat Hz di-ramp kontinu (ADR-006) — dengan LFO, ramp beat = ramp satu AudioParam (`lfo.frequency`); dengan `setValueCurveAtTime` per siklus, perubahan beat Hz butuh scheduler penjadwalan ulang yang rumit. Stack terverifikasi koheren: Vite 8.1.3 + Vitest 4.1.9 (peer `vite ^8.0.0` ✓) + @vitejs/plugin-react 6.0.3 + React 19.2.7; Node lokal v22.14.0 memenuhi requirement.

**Primary recommendation:** Scaffold `npm create vite@latest . -- --template react-ts`; engine di `src/audio/` dengan context injection; test via Vitest (environment `node`) + `node-web-audio-api` OfflineAudioContext rendering assertions; isochronic via LFO+WaveShaper; ambient via noise AudioBuffer (loop) + BiquadFilter + LFO.

## Project Constraints (from CLAUDE.md)

Dari `./CLAUDE.md` (project) dan canonical docs:

1. **Audio engine murni TypeScript tanpa dependency React** — testable, reusable untuk M003 builder (= ENG-07).
2. **Semua konstanta frekuensi preset terpusat di `presets.ts`** (relevan penuh di Phase 2; Phase 1 cukup konstanta demo di satu tempat agar tidak tersebar).
3. **iOS background audio terbatas** — mitigasi M002; Phase 1 tidak perlu menangani, cukup jangan menghalangi (jangan bergantung pada `setTimeout` untuk audio timing).
4. **GSD workflow enforcement** — perubahan file lewat GSD commands (plan → execute), bukan edit langsung.
5. Global CLAUDE.md: kode/komentar/commit English; UI Indonesia; TDD untuk feature baru; jangan drive-by edit di file tak terkait.

*Catatan: tidak ada `01-CONTEXT.md` (fase belum melalui discuss-phase) — tidak ada locked decisions tambahan di luar ADR-001..006 di ROOT/DECISIONS.md. Keputusan yang mengikat riset ini: ADR-004 (100% synthesized, no audio files), ADR-005 (Vite+React+TS, state ringan, CSS custom), ENG-07 (pure TS engine).*

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ENG-01 | Binaural beats (dua oscillator L/R) | Pattern "Binaural Graph" (ChannelMerger, diverifikasi empiris); carrier & beat param |
| ENG-02 | Isochronic tones, envelope halus tanpa click | Pattern "Isochronic Graph" (LFO→WaveShaper→gain.gain, diverifikasi empiris) + pitfall curve monotonic |
| ENG-03 | Monaural beats (dua tone dijumlah) | Pattern "Monaural Graph" (2 osc → 1 gain, penjumlahan implisit Web Audio) |
| ENG-04 | Solfeggio sebagai carrier atau pure tone | Carrier = parameter frekuensi layer binaural/isochronic; pure tone = layer oscillator+gain sendiri |
| ENG-05 | Ambient: rain/ocean/wind/brown | Pattern "Noise Recipes" (AudioBuffer loop + leaky integrator + BiquadFilter + LFO) |
| ENG-06 | Gain ramps tanpa click/pop | Pattern "Gain Ramp Discipline" (linearRamp/setTargetAtTime; exp-to-0 THROWS — diverifikasi) |
| ENG-07 | Engine pure TS, no React, unit-testable | Context injection pattern + Vitest node env + node-web-audio-api (diverifikasi di Windows) |
| UI-08 | AudioContext resume via user gesture | Pattern "Autoplay Policy" (MDN best practices, dikutip) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Sintesis audio (semua ENG-*) | Browser / Client (pure TS module `src/audio/`) | — | Web Audio API hanya ada di client; ADR-003 no backend |
| AudioContext lifecycle & resume (UI-08) | Browser / Client (React layer) | — | Autoplay policy butuh user gesture di DOM event handler |
| Play UI minimal | Browser / Client (React) | — | Walking skeleton: tombol per jenis suara |
| Unit testing engine | Node.js (Vitest, node env) | — | OfflineAudioContext via node-web-audio-api; tanpa browser |
| Static hosting/build | CDN / Static (Vite build) | — | SPA statis, tanpa server |

Seluruh aplikasi single-tier (client-only). Tidak ada API/backend/database (ADR-003).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `vite` | 8.1.3 [VERIFIED: npm registry, 2026-07-02] | Build tool + dev server | ADR-005; template react-ts resmi |
| `react` / `react-dom` | 19.2.7 [VERIFIED: npm registry] | UI layer | ADR-005 |
| `typescript` | ~5.x via template (latest npm: 6.0.3) [VERIFIED: npm registry] | Type safety | ADR-005; pakai versi yang di-pin template create-vite, jangan force-upgrade ke 6.x di fase ini |
| Web Audio API (native) | Baseline semua browser modern | Seluruh sintesis | ADR-004; zero dependency runtime untuk engine |

### Supporting (dev only)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | 4.1.9 [VERIFIED: npm registry; peer `vite ^8.0.0` cocok] | Test runner | Unit test engine, environment `node` |
| `@vitejs/plugin-react` | 6.0.3 [VERIFIED: npm registry; peer `vite ^8.0.0`] | React fast refresh | Dipasang otomatis oleh template |
| `node-web-audio-api` | 2.0.0 [VERIFIED: npm registry + tes empiris di Windows x64 mesin ini] | `OfflineAudioContext` nyata di Node untuk test | devDependency; import hanya di test files |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| node-web-audio-api (real render) | `standardized-audio-context-mock` 10.0.1 [VERIFIED: npm registry] | Mock hanya memverifikasi "node dibuat & terkoneksi", tidak memverifikasi suara yang dihasilkan. Real render menangkap bug frekuensi/envelope/click — jauh lebih bernilai untuk engine audio |
| Web Audio API mentah | Tone.js | Abstraksi Tone menghalangi kontrol AudioParam presisi yang dibutuhkan ramp scheduler Phase 2; +bundle besar; engine ini cukup sederhana |
| ChannelMergerNode untuk binaural | 2× StereoPannerNode (pan ±1) | Keduanya valid; merger lebih eksplisit "channel L murni / R murni" dan sudah diverifikasi empiris. StereoPanner pan=±1 juga full isolation — fallback sah |

**Installation:**
```bash
npm create vite@latest . -- --template react-ts   # scaffold (dir sudah berisi .planning — pilih "Ignore files and continue" saat prompt, atau scaffold di subdir lalu pindahkan)
npm install
npm install -D vitest node-web-audio-api
```
[CITED: vite.dev/guide — command scaffold & Node requirement "20.19+, 22.12+"]

**Version verification:** semua versi di atas dicek langsung via `npm view <pkg> version` pada 2026-07-02.

## Package Legitimacy Audit

slopcheck dijalankan dengan `--ecosystem npm` (auto-detect awalnya salah ke PyPI — hasil PyPI dibuang, artefak instalasi PyPI sudah di-uninstall bersih).

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| vite | npm | sejak 2020 | 141M/wk | github.com/vitejs/vite | [OK] | Approved |
| react | npm | sejak 2011 | — (top-tier) | github.com/facebook/react | [OK] | Approved |
| react-dom | npm | sejak 2011 | — (top-tier) | github.com/facebook/react | [OK] | Approved |
| typescript | npm | sejak 2012 | — (top-tier) | github.com/microsoft/TypeScript | [OK] | Approved |
| vitest | npm | sejak 2021 | 69M/wk | github.com/vitest-dev/vitest | [SUS] | Approved — false positive (lihat bawah) |
| @vitejs/plugin-react | npm | official vitejs | — | github.com/vitejs/vite-plugin-react | [OK] | Approved |
| node-web-audio-api | npm | sejak 2022 | 26K/wk | github.com/ircam-ismm/node-web-audio-api | [OK] | Approved (slopcheck: "name looks like LLM bait but package is established") |
| standardized-audio-context-mock | npm | sejak 2016 | 17K/wk | github.com/chrisguttandin/... | [OK] | Not used (alternatif saja) |

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `vitest` — slopcheck menandai "suspiciously close to 'vite'". Ini **false positive terdokumentasi**: vitest adalah test framework resmi ekosistem Vite (repo vitest-dev/vitest, 69M download/minggu, dependency `vite` resmi di peer deps). Bukti kuat legitimasi; planner tidak perlu checkpoint untuk ini, cukup catatan audit ini.

Postinstall check: `npm view <pkg> scripts.postinstall` kosong untuk semua package kunci; `node-web-audio-api` memakai prebuilt binaries via optionalDependencies napi (Windows x64 tersedia — terbukti jalan di mesin ini).

## Architecture Patterns

### System Architecture Diagram

```
                         ┌────────────── React layer (src/) ─────────────┐
User gesture (click) ───►│ Play button handler                            │
                         │   ctx = getOrCreateAudioContext()              │
                         │   if (ctx.state === 'suspended') ctx.resume()  │
                         │   engine.play(...)                             │
                         └───────────────┬────────────────────────────────┘
                                         │ inject BaseAudioContext
                                         ▼
        ┌──────────────── AudioEngine (src/audio/, pure TS) ─────────────┐
        │                                                                 │
        │  BinauralLayer      oscL(f) ──► gainL ──► merger ch0 ─┐         │
        │                     oscR(f+beat) ► gainR ► merger ch1 ─┤        │
        │                                                        ▼        │
        │  IsochronicLayer    carrier osc ──► envGain ◄── shaper ◄── LFO  │
        │                                        │                        │
        │  MonauralLayer      osc(f) ─┬──► gain ─┤                        │
        │                     osc(f+beat) ┘      │                        │
        │  SolfeggioLayer     osc(528) ► gain ───┤                        │
        │                                        ▼                        │
        │  AmbientLayer   noiseBuffer(loop) ► BiquadFilter ► gain ◄─ LFO  │
        │                                        │                        │
        │                    all layers ──► masterGain (fade in/out)      │
        └────────────────────────────────────────┬────────────────────────┘
                                                 ▼
                                        ctx.destination (speaker/headphone)

  Tests (Vitest, node env): new OfflineAudioContext(...) ──inject──► AudioEngine
                            └► startRendering() ► assert channel data
```

### Recommended Project Structure
```
src/
├── audio/                  # ENG-07: pure TS, ZERO React imports
│   ├── engine.ts           # AudioEngine facade: constructor(ctx: BaseAudioContext), play/stop per layer, masterGain
│   ├── layers/
│   │   ├── binaural.ts     # ENG-01
│   │   ├── isochronic.ts   # ENG-02
│   │   ├── monaural.ts     # ENG-03
│   │   ├── solfeggio.ts    # ENG-04 (pure tone layer)
│   │   └── ambient.ts      # ENG-05 (rain|ocean|wind|brown)
│   ├── noise.ts            # noise buffer generators (white/brown + filtered variants)
│   ├── ramps.ts            # ENG-06: fadeIn/fadeOut/setGainSmooth helpers
│   └── types.ts            # LayerParams, AmbientKind, dsb.
├── App.tsx                 # UI-08 + tombol audition per jenis suara
└── main.tsx
tests/
└── audio/                  # Vitest node env; import node-web-audio-api di sini saja
    ├── binaural.test.ts
    ├── isochronic.test.ts
    ├── monaural.test.ts
    ├── ambient.test.ts
    └── ramps.test.ts
```

### Pattern 1: Context Injection (kunci ENG-07 + testability)
**What:** Engine tidak pernah membuat `AudioContext` sendiri. Constructor menerima `BaseAudioContext` (supertype dari `AudioContext` dan `OfflineAudioContext`).
**When to use:** Semua kode engine.
```typescript
// src/audio/engine.ts — [VERIFIED: pattern dites empiris dengan OfflineAudioContext node-web-audio-api]
export class AudioEngine {
  private readonly master: GainNode;
  constructor(private readonly ctx: BaseAudioContext) {
    this.master = ctx.createGain();
    this.master.gain.value = 0;           // mulai silent; fade-in saat play
    this.master.connect(ctx.destination);
  }
}
```
React layer membuat `new AudioContext()` **lazily di click handler pertama** dan menyimpannya (singleton module-level di sisi React, bukan di engine).

### Pattern 2: Binaural Graph (ENG-01)
```typescript
// [VERIFIED: dirender empiris — L≈200Hz, R≈210Hz terukur via zero-crossing count]
const merger = ctx.createChannelMerger(2);
merger.connect(masterGain);
const oscL = ctx.createOscillator(); oscL.frequency.value = carrier;        // mis. 200 (atau solfeggio)
const oscR = ctx.createOscillator(); oscR.frequency.value = carrier + beat; // mis. 210 → beat 10 Hz
const gL = ctx.createGain(), gR = ctx.createGain();
oscL.connect(gL).connect(merger, 0, 0);  // channel LEFT
oscR.connect(gR).connect(merger, 0, 1);  // channel RIGHT
oscL.start(t); oscR.start(t);
```
Carrier ideal 100–500 Hz (domain, KNOWLEDGE.md); solfeggio (mis. 528) sebagai carrier = ENG-04 mode "carrier".

### Pattern 3: Isochronic Graph — LFO + WaveShaper (ENG-02)
**What:** Carrier oscillator → GainNode (base 0); LFO sine di beat Hz → WaveShaper (curve memetakan sine → pulse halus 0..1) → connect ke `gain.gain` (audio-rate modulation).
**Why this over `setValueCurveAtTime`:** beat Hz Phase 2 harus di-ramp — dengan LFO cukup `lfo.frequency.linearRampToValueAtTime(...)`; dengan value curve per siklus, panjang siklus berubah-ubah dan butuh rescheduling kompleks. `setValueCurveAtTime` juga throw jika overlap dengan automation lain di param yang sama.
```typescript
// [VERIFIED: mekanisme dirender empiris (pulse terdeteksi, peak 0.999). PENTING: curve harus MONOTONIC.]
const carrierOsc = ctx.createOscillator(); carrierOsc.frequency.value = carrier;
const envGain = ctx.createGain(); envGain.gain.value = 0;   // base 0 — envelope 100% dari shaper
const lfo = ctx.createOscillator(); lfo.frequency.value = beatHz;
const N = 2048;
const curve = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const x = (i / (N - 1)) * 2 - 1;                 // domain input WaveShaper: -1..1
  // Monotonic raised-cosine rise: off saat x<=0, naik halus 0→1 untuk x 0..0.8, plateau 1
  const p = Math.min(Math.max(x / 0.8, 0), 1);
  curve[i] = 0.5 * (1 - Math.cos(Math.PI * p));
}
const shaper = ctx.createWaveShaper(); shaper.curve = curve;
lfo.connect(shaper); shaper.connect(envGain.gain);
carrierOsc.connect(envGain).connect(masterGain);
carrierOsc.start(t); lfo.start(t);
```
Duty cycle dikontrol lewat bentuk curve (threshold x mulai naik). ~50% on-time adalah default wajar [ASSUMED — konvensi umum isochronic, tune by ear].

### Pattern 4: Monaural Graph (ENG-03)
Dua oscillator (f dan f+beat) connect ke SATU GainNode — Web Audio menjumlahkan input secara otomatis (unity summing). Set masing-masing pre-gain ~0.5 agar jumlah tidak clip. Output mono tersebar sama ke L/R → beat fisik terdengar di speaker.

### Pattern 5: Noise Recipes (ENG-05)
**Jangan pakai ScriptProcessorNode (deprecated).** Generate noise ke `AudioBuffer` sekali (durasi 5–10 detik), loop via `AudioBufferSourceNode`.

```typescript
// White noise buffer — [CITED: noisehack.com/generate-noise-web-audio-api, diadaptasi dari ScriptProcessor ke buffer]
function createWhiteNoiseBuffer(ctx: BaseAudioContext, seconds = 5): AudioBuffer {
  const buf = ctx.createBuffer(1, seconds * ctx.sampleRate, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}
// Brown noise: leaky integrator, koefisien klasik 0.02/1.02, gain kompensasi 3.5
// [CITED: noisehack.com — koefisien persis dari artikel]
function createBrownNoiseBuffer(ctx: BaseAudioContext, seconds = 10): AudioBuffer {
  const buf = ctx.createBuffer(1, seconds * ctx.sampleRate, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const white = Math.random() * 2 - 1;
    d[i] = (last + 0.02 * white) / 1.02;
    last = d[i];
    d[i] *= 3.5;
  }
  // Loop-seam fix: crossfade ~50ms akhir buffer menuju nilai awal (lihat Pitfall 4)
  return buf;
}
```

Resep per ambient (parameter awal — semua nilai numerik [ASSUMED: sintesis komunitas/subtractive-synth lore, WAJIB tuning by ear saat implementasi]):

| Ambient | Source | Filter | Modulation |
|---------|--------|--------|------------|
| **Brown** | brown buffer loop | (none) | (none) — statis |
| **Ocean** | brown/white buffer | lowpass ~400 Hz | gain LFO sine 0.07–0.13 Hz (periode ombak 8–12 s), depth: gain berayun ~0.3→1.0 via ConstantSourceNode offset + LFO×depth ke `gain.gain` |
| **Wind** | white/pink buffer | bandpass center ~400–800 Hz, Q≈0.5–1 | LFO ~0.1–0.25 Hz ke `filter.frequency` (sapuan ±200–400 Hz) + gain modulasi ringan |
| **Rain** | white buffer | highpass ~800–1200 Hz (+ optional lowpass ~7 kHz) | statis / modulasi sangat halus; kualitas "granular droplets" ditunda ke M002 (sesuai ROADMAP) |

LFO→gain trick: `gain.gain.value = baseLevel`; LFO → GainNode kecil (depth) → connect ke `gain.gain` (AudioParam menjumlahkan intrinsic value + input signal). `ConstantSourceNode` tersedia di node-web-audio-api juga [VERIFIED: tes empiris].

### Pattern 6: Gain Ramp Discipline (ENG-06)
```typescript
// src/audio/ramps.ts
const MIN_FADE = 0.05; // 50ms — minimum fade master [CITED: MDN best practices merekomendasikan AudioParam scheduling; angka 50ms konvensi dari KNOWLEDGE.md]
export function fadeIn(param: AudioParam, target: number, t: number, dur = MIN_FADE) {
  param.cancelScheduledValues(t);
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(target, t + dur);
}
export function fadeOut(param: AudioParam, t: number, dur = MIN_FADE) {
  param.cancelScheduledValues(t);
  param.setValueAtTime(param.value, t);       // anchor — tanpa ini ramp mulai dari event terakhir, bisa jump
  param.linearRampToValueAtTime(0.0001, t + dur);
  param.setValueAtTime(0, t + dur);
}
```
- JANGAN set `gain.value = x` langsung saat audio berjalan (click). [CITED: MDN Web Audio best practices]
- `exponentialRampToValueAtTime(0, ...)` **THROWS RangeError** — target harus > 0 (pakai 0.0001 lalu set 0, atau `setTargetAtTime(0, t, τ)`). [VERIFIED: tes empiris — RangeError "value (0.0) should not be equal to zero"]
- Stop source (`osc.stop(t + dur + margin)`) SETELAH fade selesai, dijadwalkan dengan waktu AudioContext, bukan setTimeout.

### Pattern 7: Autoplay Policy (UI-08)
```typescript
// React layer — [CITED: developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices]
let ctx: AudioContext | null = null;
async function ensureContext(): Promise<AudioContext> {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") await ctx.resume();  // wajib dari dalam user gesture handler
  return ctx;
}
// onClick tombol Play: const c = await ensureContext(); engine.play(...)
```
Buat context lazily di gesture pertama = paling aman lintas browser (Chrome/Safari). `resume()` harus dipanggil dalam call stack event handler (penting untuk iOS Safari).

### Anti-Patterns to Avoid
- **`new AudioContext()` di module scope engine** — melanggar ENG-07, merusak testability, dan context lahir `suspended` di luar gesture.
- **ScriptProcessorNode untuk noise** — deprecated sejak lama; pakai pre-generated AudioBuffer loop (atau AudioWorklet kalau perlu — tidak perlu di fase ini).
- **`setTimeout`/`setInterval` untuk timing audio** — drift; semua penjadwalan pakai `ctx.currentTime` (SCH-03 Phase 2, tapi disiplin dimulai sekarang).
- **Re-create oscillator per perubahan frekuensi** — ramp `osc.frequency` param saja.
- **Square-wave LFO langsung ke gain untuk isochronic** — on/off instan = click di tiap pulse; harus envelope halus (raised-cosine via WaveShaper).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Web Audio di Node untuk test | Mock manual AudioContext/AudioParam | `node-web-audio-api` (real render) | Mock manual = ratusan LOC rapuh yang tidak memverifikasi suara; real render menangkap bug frekuensi/envelope nyata |
| Fade/ramp scheduling | Loop manual per-sample / setInterval gain | `AudioParam.linearRampToValueAtTime` / `setTargetAtTime` | Native, sample-accurate, tanpa main-thread jitter |
| Channel routing L/R | Manipulasi buffer stereo manual | `ChannelMergerNode` / `StereoPannerNode` | Native node, diverifikasi |
| Penjumlahan monaural | Mixing buffer manual | Multiple connect ke satu GainNode | Web Audio unity summing built-in |
| Test runner/assertion | Script node custom | Vitest 4 | Terintegrasi Vite 8, environment node |

**Key insight:** Web Audio API sudah menyediakan primitive sample-accurate untuk semua kebutuhan fase ini — kode engine kita hanyalah komposisi graph + disiplin parameter scheduling. Satu-satunya "sintesis manual" yang sah adalah pengisian noise buffer (resep standar 10 baris).

## Common Pitfalls

### Pitfall 1: WaveShaper curve non-monotonic → pulse ganda
**What goes wrong:** Isochronic menghasilkan 2× beat Hz (pulse ganda per siklus LFO).
**Why it happens:** WaveShaper memetakan NILAI input sesaat (bukan fase). Sine naik 0→1 lalu turun 1→0 tiap setengah siklus; kalau curve naik lalu turun (non-monotonic), envelope melewati puncak dua kali per siklus. [VERIFIED: direproduksi empiris — curve non-monotonic menghasilkan 20 pulse pada LFO 10 Hz]
**How to avoid:** Curve harus fungsi monotonic non-decreasing dari input (contoh di Pattern 3: plateau 1 setelah x≥0.8).
**Warning signs:** Test pulse-count menghitung 2× beat Hz.

### Pitfall 2: `exponentialRampToValueAtTime(0)` throws
**What goes wrong:** RangeError saat fade-out. [VERIFIED: empiris]
**How to avoid:** Target 0.0001 lalu `setValueAtTime(0)`, atau `setTargetAtTime(0, t, τ)` (boleh target 0 — verified OK).

### Pitfall 3: Ramp tanpa anchor event
**What goes wrong:** `linearRampToValueAtTime` merambat dari EVENT terjadwal terakhir, bukan dari nilai sekarang → lompatan/click bila tidak ada event sebelumnya.
**How to avoid:** Selalu `cancelScheduledValues(t)` + `setValueAtTime(current, t)` sebelum ramp (lihat Pattern 6).

### Pitfall 4: Loop seam click pada brown noise
**What goes wrong:** Brown noise adalah random walk — sample terakhir ≠ sample pertama → diskontinuitas tiap loop (click periodik tiap N detik).
**How to avoid:** Crossfade ~50ms ujung buffer ke nilai awal saat generate, atau buffer panjang (10 s) + fade seam. White noise tidak bermasalah (tiap sample independen).
**Warning signs:** "tick" berkala pada ambient brown/ocean dengan periode = panjang buffer.

### Pitfall 5: Scaffold create-vite di direktori non-kosong
**What goes wrong:** Direktori proyek sudah berisi `.planning/`, `CLAUDE.md`, dll — `npm create vite@latest .` mendeteksi non-empty dan prompt interaktif (menggantung di eksekusi non-interaktif).
**How to avoid:** Scaffold ke subdir sementara lalu pindahkan isinya, ATAU jawab prompt "Ignore files and continue". Di plan, jadikan langkah eksplisit non-interaktif (mis. scaffold di temp dir + copy).

### Pitfall 6: Vitest environment salah untuk engine test
**What goes wrong:** Default template kadang menyetel `environment: 'jsdom'`; jsdom TIDAK punya Web Audio, dan node-web-audio-api tidak butuh DOM.
**How to avoid:** `test.environment: 'node'` untuk test engine (default Vitest adalah node — cukup jangan menimpanya). Import `OfflineAudioContext` eksplisit dari `node-web-audio-api` di test file, inject ke engine.

### Pitfall 7: TypeScript type mismatch antara lib DOM dan node-web-audio-api
**What goes wrong:** Engine ditulis terhadap tipe DOM (`BaseAudioContext` dari lib.dom); instance node-web-audio-api secara struktural kompatibel tapi nominal berbeda → TS error di test.
**How to avoid:** Cast satu kali di test (`as unknown as BaseAudioContext`) atau definisikan interface minimal sendiri di `types.ts`. [ASSUMED: friksi tipe umum pada dual-environment; solusi cast standar]

## Code Examples

Contoh terverifikasi (dari sesi empiris di mesin ini, node-web-audio-api 2.0.0, Windows x64, Node 22.14.0):

### Test rendering assertion — binaural stereo
```typescript
// tests/audio/binaural.test.ts — [VERIFIED: dijalankan empiris, L≈199 R≈209 zero-crossings/detik]
import { describe, it, expect } from "vitest";
import { OfflineAudioContext } from "node-web-audio-api";

function estimateHz(d: Float32Array): number {
  let c = 0;
  for (let i = 1; i < d.length; i++) if (d[i - 1] < 0 && d[i] >= 0) c++;
  return c; // zero-crossing naik per 1 detik render = ~frekuensi
}

it("renders carrier on L and carrier+beat on R", async () => {
  const ctx = new OfflineAudioContext(2, 44100, 44100);
  // ... bangun BinauralLayer(ctx, { carrier: 200, beat: 10 }), start(0)
  const buf = await ctx.startRendering();
  expect(estimateHz(buf.getChannelData(0))).toBeCloseTo(200, -1); // toleransi ±5
  expect(estimateHz(buf.getChannelData(1))).toBeCloseTo(210, -1);
});
```

### Test click-free: derivatif sample maksimum
```typescript
// Deteksi click: lonjakan sample-to-sample besar = diskontinuitas
function maxDelta(d: Float32Array): number {
  let m = 0;
  for (let i = 1; i < d.length; i++) m = Math.max(m, Math.abs(d[i] - d[i - 1]));
  return m;
}
// Untuk sine 528 Hz @44.1kHz amplitudo A, delta alami ≈ A * 2π*528/44100 ≈ 0.075A.
// Assertion: maxDelta < ~2× delta alami sepanjang fade in/out → tidak ada step discontinuity.
```
[ASSUMED: heuristik threshold — kalibrasi konstanta saat implementasi; prinsip diskontinuitas = click adalah standar DSP]

### Test isochronic: pulse count
```typescript
// Render 1 detik, hitung onset pulse (amp naik melewati threshold dari keadaan silent)
// expect(pulses).toBe(beatHz) — curve monotonic benar menghasilkan tepat beatHz pulse/detik
```
[VERIFIED: teknik dipakai empiris untuk menangkap bug curve non-monotonic]

### Vitest config minimal
```typescript
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
```
[CITED: pola standar Vitest — `test` key di vite.config; perlu `/// <reference types="vitest/config" />` atau import dari "vitest/config"]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ScriptProcessorNode untuk noise/DSP | Pre-generated AudioBuffer loop; AudioWorklet untuk DSP real-time | Deprecated bertahun lalu; Worklet baseline sejak ~2021 | Resep noisehack harus diadaptasi dari ScriptProcessor ke buffer-fill (sudah dilakukan di Pattern 5) |
| Mock Web Audio di test (standardized-audio-context-mock) | Real render via node-web-audio-api (Rust/napi) | node-web-audio-api matang ~2023+, v2.0.0 sekarang | Test engine = assertion terhadap audio nyata; kepercayaan jauh lebih tinggi |
| webkitAudioContext prefix | `AudioContext` standar | Lama | Tidak perlu prefix handling di 2026 |
| Vitest 2/3 | Vitest 4.x (peer Vite 6–8) | Vitest 4 GA (2025) | Config `projects` menggantikan `workspace`; untuk fase ini config single sederhana saja |
| Vite 7 (esbuild/rollup) | Vite 8 (Rolldown-based) | Vite 8 (2025/2026) | [ASSUMED — diindikasikan peer deps `@rolldown/plugin-babel` di plugin-react 6; tidak memengaruhi desain engine] |

**Deprecated/outdated:**
- `ScriptProcessorNode` — diganti AudioWorklet / pre-rendered buffers.
- `setValueCurveAtTime` bukan deprecated, tapi untuk isochronic dengan beat Hz yang akan di-ramp, LFO+WaveShaper lebih maintainable (lihat Pattern 3).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Parameter numerik ambient (cutoff, Q, LFO rate/depth untuk rain/ocean/wind) | Pattern 5 | Rendah — hanya kualitas estetik; struktur graph tetap benar; tuning by ear saat implementasi |
| A2 | Duty cycle isochronic ~50% dengan raised-cosine adalah default yang baik | Pattern 3 | Rendah — dapat di-tweak via curve tanpa ubah arsitektur |
| A3 | Threshold heuristik test click-free (2× delta alami) | Code Examples | Rendah — kalibrasi saat menulis test |
| A4 | Vite 8 berbasis Rolldown | State of the Art | Nol untuk fase ini — tidak memengaruhi desain |
| A5 | Cast tipe `as unknown as BaseAudioContext` diperlukan di test | Pitfall 7 | Rendah — kalau ternyata kompatibel langsung, hapus cast |
| A6 | Fade minimum 50ms cukup mencegah click terdengar di semua device | Pattern 6 | Rendah — mudah dinaikkan; test empiris memverifikasi kontinuitas sinyal |

## Open Questions

1. **UI walking skeleton: satu tombol per jenis suara, atau satu play + selector?**
   - What we know: goal fase = "menekan tombol play dan mendengar SETIAP jenis suara" — audition per jenis.
   - What's unclear: bentuk UI minimal (5 tombol vs dropdown+play). Tidak ada CONTEXT.md.
   - Recommendation: 5–8 tombol audition sederhana (binaural, isochronic, monaural, solfeggio, rain, ocean, wind, brown) + stop + master volume slider. Ini discretion planner; UI-07 (theme) baru di Phase 3.
2. **Verifikasi telinga manusia** — test otomatis membuktikan sinyal benar secara matematis, tapi "terdengar bersih" butuh telinga. Recommendation: plan menyertakan satu `checkpoint:human-verify` di akhir fase (buka dev server, dengarkan tiap suara dengan headphone).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js ≥20.19/22.12 | Vite 8, Vitest 4 | ✓ | v22.14.0 | — |
| npm | Install & scaffold | ✓ | (bundled Node 22) | — |
| node-web-audio-api prebuilt Windows x64 | Test engine | ✓ [VERIFIED: terinstal & render sukses di mesin ini] | 2.0.0 | standardized-audio-context-mock (kualitas test turun) |
| Browser modern (Chrome/Edge) | Manual audio check | ✓ (Windows 11) | — | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none — semua tersedia.

## Security Domain

Konteks: aplikasi client-only, tanpa backend/akun/input eksternal (ADR-003). Permukaan serangan minimal.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Tidak ada auth (ADR-003) |
| V3 Session Management | no | Tidak ada session |
| V4 Access Control | no | Tidak ada resource ter-protect |
| V5 Input Validation | minimal | Semua input = konstanta internal & slider UI; engine tetap clamp range param (freq > 0, gain 0..1) — defensive, murah |
| V6 Cryptography | no | Tidak ada data sensitif |

### Known Threat Patterns for stack (Vite/React/npm)

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Supply-chain (typosquat/hallucinated deps) | Tampering | Package Legitimacy Audit di atas (semua OK); commit `package-lock.json`; jangan tambah dep di luar daftar |
| XSS via rendering | Tampering | React auto-escaping; larang `dangerouslySetInnerHTML` (tidak dibutuhkan) |
| Audio "loudness bomb" (gain > 1 melukai telinga) | Denial/Safety | Clamp masterGain ≤ 1.0 di engine; fade-in default — ini safety requirement nyata untuk app audio headphone |

## Sources

### Primary (HIGH confidence)
- npm registry (`npm view`, api.npmjs.org) — versi, peer deps, tanggal rilis, downloads semua package (2026-07-02)
- **Tes empiris lokal** (node-web-audio-api 2.0.0, Windows x64, Node 22.14.0) — OfflineAudioContext render, ChannelMerger stereo, setValueCurveAtTime, WaveShaper modulation, exponentialRamp-to-0 exception, ConstantSourceNode
- [MDN Web Audio Best Practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices) — autoplay/resume, AudioParam scheduling
- [vite.dev/guide](https://vite.dev/guide/) — scaffold command, Node requirement
- [github.com/ircam-ismm/node-web-audio-api](https://github.com/ircam-ismm/node-web-audio-api) — prebuilt binaries Windows x64/arm64

### Secondary (MEDIUM confidence)
- [noisehack.com — Generate Noise with Web Audio API](https://noisehack.com/generate-noise-web-audio-api/) — koefisien brown noise (0.02/1.02/3.5) & pink (Paul Kellet); artikel klasik, koefisien banyak direplikasi komunitas
- [MDN setValueCurveAtTime](https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setValueCurveAtTime), [MDN Advanced techniques](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques)

### Tertiary (LOW confidence — parameter tuning saja)
- [Knobulism — Synthetic Wilderness: Recreating Nature Sounds](https://www.knobulism.com/2025/01/29/synthetic-wilderness-recreating-nature-sounds/), [SyntherJack Ocean Noise Generator](https://syntherjack.net/ocean-noise-generator/) — resep ocean/wind/rain (noise + filter + slow LFO); nilai numerik ditandai [ASSUMED]

*Catatan proses: Context7 MCP & ctx7 CLI tidak tersedia di environment agent ini — dokumentasi diverifikasi via WebFetch ke sumber resmi + tes empiris (lebih kuat untuk klaim runtime).*

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versi & kompatibilitas peer deps diverifikasi langsung di registry; legitimacy audit lulus
- Architecture (graph design): HIGH — pattern inti (binaural, isochronic, ramps, offline render) diverifikasi empiris di mesin target
- Testing strategy: HIGH — dibuktikan jalan end-to-end di Windows lokal
- Pitfalls: HIGH untuk yang [VERIFIED] (exp-ramp-0, curve monotonic); MEDIUM untuk loop-seam & type friction
- Ambient recipes: struktur HIGH, parameter numerik LOW/[ASSUMED] (estetik, tune by ear)

**Research date:** 2026-07-02
**Valid until:** 2026-08-02 (stack stabil; Web Audio API sangat stabil)
