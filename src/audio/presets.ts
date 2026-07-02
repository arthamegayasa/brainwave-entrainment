import type { AmbientKind } from "./types";
import { SOLFEGGIO } from "./constants";

export type Band = "delta" | "theta" | "alpha" | "beta" | "gamma";

/**
 * A goal-first session preset (PRE-02): every number that shapes a session
 * lives here and nowhere else.
 *
 * Ramp model (ADR-006): beat starts near waking frequency (startHz), descends
 * (or ascends) to targetHz over rampInMin, holds, then returns to endHz over
 * rampOutMin. endHz === null means NO closing ramp (sleep presets stay low).
 */
export interface Preset {
  id: string;
  /** Display name (UI is goal-first — no Hz in the main flow). */
  name: string;
  tagline: string;
  emoji: string;
  band: Band;
  targetHz: number;
  startHz: number;
  /** null = end at target (fade out only, no closing ramp) — SCH-02. */
  endHz: number | null;
  rampInMin: number;
  rampOutMin: number;
  /** Carrier tone (solfeggio) used by both binaural and isochronic modes. */
  carrierHz: number;
  defaultAmbient: AmbientKind | null;
  /** Monetization scaffold (MON-01): gating UI reads this; all unlocked in this build. */
  premium: boolean;
}

export const PRESETS: readonly Preset[] = [
  {
    id: "deep-sleep",
    name: "Deep Sleep",
    tagline: "Drift down into delta waves for deep, restful sleep",
    emoji: "🌙",
    band: "delta",
    targetHz: 2,
    startHz: 10,
    endHz: null,
    rampInMin: 20,
    rampOutMin: 0,
    carrierHz: SOLFEGGIO.foundation,
    defaultAmbient: "brown",
    premium: false,
  },
  {
    id: "deep-meditation",
    name: "Deep Meditation",
    tagline: "Theta 6 Hz — the state of seasoned meditators",
    emoji: "🧘",
    band: "theta",
    targetHz: 6,
    startHz: 10,
    endHz: 10,
    rampInMin: 15,
    rampOutMin: 5,
    carrierHz: SOLFEGGIO.healing,
    defaultAmbient: "ocean",
    premium: false,
  },
  {
    id: "healing-relaxation",
    name: "Healing & Relaxation",
    tagline: "7.83 Hz (Schumann resonance) with a 528 Hz carrier",
    emoji: "💚",
    band: "theta",
    targetHz: 7.83,
    startHz: 11,
    endHz: 10,
    rampInMin: 12,
    rampOutMin: 5,
    carrierHz: SOLFEGGIO.healing,
    defaultAmbient: "ocean",
    premium: false,
  },
  {
    id: "anxiety-relief",
    name: "Calm Anxiety",
    tagline: "Soothing alpha to release tension",
    emoji: "🍃",
    band: "alpha",
    targetHz: 10,
    startHz: 13,
    endHz: 11,
    rampInMin: 8,
    rampOutMin: 3,
    carrierHz: SOLFEGGIO.liberation,
    defaultAmbient: "rain",
    premium: false,
  },
  {
    id: "focus",
    name: "Focus",
    tagline: "Low beta for work and study concentration",
    emoji: "🎯",
    band: "beta",
    targetHz: 15,
    startHz: 10,
    endHz: null,
    rampInMin: 10,
    rampOutMin: 0,
    carrierHz: SOLFEGGIO.expression,
    defaultAmbient: "rain",
    premium: false,
  },
  {
    id: "energy",
    name: "Energy",
    tagline: "Gamma 40 Hz for alertness and drive",
    emoji: "⚡",
    band: "gamma",
    targetHz: 40,
    startHz: 15,
    endHz: null,
    rampInMin: 8,
    rampOutMin: 0,
    carrierHz: SOLFEGGIO.intuition,
    defaultAmbient: null,
    premium: true,
  },
  {
    id: "creativity",
    name: "Creativity",
    tagline: "The alpha-theta border — room for ideas and imagination",
    emoji: "🎨",
    band: "theta",
    targetHz: 7.5,
    startHz: 10,
    endHz: 10,
    rampInMin: 12,
    rampOutMin: 5,
    carrierHz: SOLFEGGIO.connection,
    defaultAmbient: "wind",
    premium: true,
  },
  {
    id: "power-nap",
    name: "Power Nap",
    tagline: "Sink into theta-delta, then wake refreshed at the end",
    emoji: "☀️",
    band: "theta",
    targetHz: 3.5,
    startHz: 10,
    endHz: 12,
    rampInMin: 10,
    rampOutMin: 5,
    carrierHz: SOLFEGGIO.foundation,
    defaultAmbient: "brown",
    premium: true,
  },
] as const;

export function getPreset(id: string): Preset {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`Unknown preset: ${id}`);
  return preset;
}

/** Session duration choices in minutes; null = infinite (∞). */
export const DURATIONS_MIN: readonly (number | null)[] = [15, 30, 45, 60, null];
