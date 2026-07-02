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
  /** Indonesian display name (UI is goal-first — no Hz in the main flow). */
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
    name: "Tidur Nyenyak",
    tagline: "Turun perlahan ke gelombang delta untuk tidur dalam",
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
    name: "Meditasi Dalam",
    tagline: "Theta 6 Hz — kondisi meditasi para praktisi berpengalaman",
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
    name: "Healing & Relaksasi",
    tagline: "7.83 Hz (resonansi Schumann) dengan carrier 528 Hz",
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
    name: "Redakan Cemas",
    tagline: "Alpha menenangkan untuk melepas ketegangan",
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
    name: "Fokus",
    tagline: "Beta rendah untuk konsentrasi kerja & belajar",
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
    name: "Energi",
    tagline: "Gamma 40 Hz untuk kewaspadaan dan semangat",
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
    name: "Kreativitas",
    tagline: "Perbatasan alpha-theta — ruang ide dan imajinasi",
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
    tagline: "Turun ke theta-delta lalu bangun segar di akhir sesi",
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
