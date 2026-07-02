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
    // ASSUMED — tune by ear
    ocean: { lowpassHz: 400, lfoHz: 0.1, lfoDepth: 0.35, baseGain: 0.65 },
    // ASSUMED — tune by ear
    wind: { bandpassHz: 600, q: 0.7, lfoHz: 0.15, sweepHz: 300 },
    // ASSUMED — tune by ear
    rain: { highpassHz: 1000, lowpassHz: 7000 },
  },
} as const;

/** Indonesian labels for the audition UI. */
export const SOUND_LABELS_ID: Record<SoundKind, string> = {
  binaural: "Binaural",
  isochronic: "Isochronic",
  monaural: "Monaural",
  solfeggio: "Solfeggio 528 Hz",
  rain: "Hujan",
  ocean: "Ombak Laut",
  wind: "Angin",
  brown: "Brown Noise",
};
