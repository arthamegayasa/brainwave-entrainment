import { SOLFEGGIO } from "./constants";

/** A harmonically related frequency suggestion (BLD-02). */
export interface FreqSuggestion {
  hz: number;
  /** Indonesian relation label shown in the UI. */
  relation: string;
  /** 0..1 — how strongly the suggestion correlates with the base. */
  correlation: number;
}

const MIN_HZ = 20;
const MAX_HZ = 1500;

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Suggest frequencies harmonically related to `baseHz`: octaves, perfect
 * fifth/fourth, major third, harmonic series, and the nearest solfeggio
 * tones. Sorted by correlation (strongest first), deduplicated, and bounded
 * to the audible carrier range 20–1500 Hz.
 */
export function findRelated(baseHz: number): FreqSuggestion[] {
  if (!Number.isFinite(baseHz) || baseHz <= 0) return [];

  const raw: FreqSuggestion[] = [
    { hz: baseHz * 2, relation: "Octave up (2:1)", correlation: 1 },
    { hz: baseHz / 2, relation: "Octave down (1:2)", correlation: 1 },
    { hz: baseHz * 4, relation: "Two octaves up (4:1)", correlation: 0.9 },
    { hz: baseHz * 1.5, relation: "Perfect fifth (3:2)", correlation: 0.85 },
    { hz: baseHz * (4 / 3), relation: "Perfect fourth (4:3)", correlation: 0.75 },
    { hz: baseHz * 1.25, relation: "Major third (5:4)", correlation: 0.7 },
    { hz: baseHz * 3, relation: "3rd harmonic", correlation: 0.8 },
    { hz: baseHz * 5, relation: "5th harmonic", correlation: 0.6 },
  ];

  // Nearest solfeggio tones (traditional scale — labeled as such).
  const solfeggio = (Object.entries(SOLFEGGIO) as Array<[string, number]>)
    .map(([, hz]) => ({
      hz,
      distance: Math.abs(Math.log2(hz / baseHz)),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 2)
    .map((s) => ({
      hz: s.hz,
      relation: "Nearest solfeggio",
      correlation: Math.max(0.3, 0.65 - s.distance * 0.3),
    }));

  const all = [...raw, ...solfeggio]
    .map((s) => ({ ...s, hz: round2(s.hz) }))
    .filter((s) => s.hz >= MIN_HZ && s.hz <= MAX_HZ && s.hz !== round2(baseHz));

  // Deduplicate by hz, keeping the highest correlation.
  const byHz = new Map<number, FreqSuggestion>();
  for (const s of all) {
    const existing = byHz.get(s.hz);
    if (!existing || existing.correlation < s.correlation) byHz.set(s.hz, s);
  }

  return [...byHz.values()].sort((a, b) => b.correlation - a.correlation);
}
