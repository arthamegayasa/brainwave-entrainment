import type { SoundKind } from "./types";

/** Solfeggio frequencies (Hz) — traditional scale; 528 is the "healing" tone. */
export const SOLFEGGIO = {
  foundation: 174,
  restoration: 285,
  liberation: 396,
  change: 417,
  healing: 528,
  connection: 639,
  expression: 741,
  intuition: 852,
  unity: 963,
} as const;

/** Minimum fade duration (seconds) — every gain change must ramp at least this long. */
export const FADE_SEC = 0.05;

/** Demo audition parameters for Phase 1 — the ONLY place demo numbers live. */
export const DEMO = {
  binaural: { carrier: 200, beat: 10 },
  isochronic: { carrier: SOLFEGGIO.healing, beat: 10 }, // solfeggio-as-carrier
  monaural: { carrier: 200, beat: 10 },
  solfeggio: { tone: SOLFEGGIO.healing },
  ambient: {
    // Tuned for label distinctness (QUICK-260714-P5O); pinned by spectral
    // signature tests in tests/audio/ambient.test.ts — keep them green.
    // ~6.7 s wave period, deep swell; baseGain - lfoDepth > 0 (never negative)
    // and baseGain + lfoDepth <= 1 (no clipping).
    ocean: { lowpassHz: 400, lfoHz: 0.15, lfoDepth: 0.45, baseGain: 0.55 },
    // ~4 s gust cycle so the bandpass sweep reads as moving wind, not waves.
    wind: { bandpassHz: 600, q: 0.7, lfoHz: 0.25, sweepHz: 300 },
    // Highpass raised to sharpen hiss vs wind's mid whoosh (baseGain tames
    // biquad resonance boost that clips).
    rain: { highpassHz: 1200, lowpassHz: 7000, baseGain: 0.5 },
  },
} as const;

/** Display labels for each sound kind. */
export const SOUND_LABELS: Record<SoundKind, string> = {
  binaural: "Binaural",
  isochronic: "Isochronic",
  monaural: "Monaural",
  solfeggio: "Solfeggio 528 Hz",
  rain: "Rain",
  ocean: "Ocean",
  wind: "Wind",
  brown: "Brown Noise",
};
