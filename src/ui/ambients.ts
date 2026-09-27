import { SOUND_LABELS } from "../audio/constants";
import { AMBIENT_KINDS } from "../audio/types";
import type { AmbientKind } from "../audio/types";

const ICONS: Record<AmbientKind, string> = {
  rain: "🌧️",
  ocean: "🌊",
  wind: "🌬️",
  stream: "💧",
  forest: "🌲",
  night: "🌙",
  brown: "🟤",
};

/** The ambient choices of a Preset Play, with their icons; null = no ambient. */
export const AMBIENTS: readonly { kind: AmbientKind | null; icon: string }[] = [
  { kind: null, icon: "⊘" },
  ...AMBIENT_KINDS.map((kind) => ({ kind, icon: ICONS[kind] })),
];

/** The on-screen name of an ambient choice. */
export function ambientLabel(kind: AmbientKind | null): string {
  return kind === null ? "No ambient" : SOUND_LABELS[kind];
}
