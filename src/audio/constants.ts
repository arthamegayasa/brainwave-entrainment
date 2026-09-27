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
  stream: "Stream",
  forest: "Forest",
  night: "Night",
  brown: "Brown Noise",
};
