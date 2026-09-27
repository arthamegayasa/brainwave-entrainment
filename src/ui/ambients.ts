import { SOUND_LABELS } from "../audio/constants";
import type { AmbientKind } from "../audio/types";

/** The ambient choices of a Preset Play, with their icons; null = no ambient. */
export const AMBIENTS: readonly { kind: AmbientKind | null; icon: string }[] = [
  { kind: null, icon: "⊘" },
  { kind: "rain", icon: "🌧️" },
  { kind: "ocean", icon: "🌊" },
  { kind: "wind", icon: "🌬️" },
  { kind: "brown", icon: "🟤" },
];

/** The on-screen name of an ambient choice. */
export function ambientLabel(kind: AmbientKind | null): string {
  return kind === null ? "No ambient" : SOUND_LABELS[kind];
}
