import type { SessionVolumes } from "../audio/session";
import type { AmbientKind } from "../audio/types";
import type { ListeningMode } from "../audio/session";

/** User preferences persisted across reloads (PWA-03). */
export interface Prefs {
  volumes: Partial<SessionVolumes>;
  lastPresetId: string | null;
  lastDurationMin: number | null | "inf";
  lastMode: ListeningMode;
  lastAmbient: AmbientKind | null;
  visited: boolean;
}

const KEY = "serenade.prefs.v1";

const DEFAULTS: Prefs = {
  volumes: {},
  lastPresetId: null,
  lastDurationMin: 30,
  lastMode: "headphone",
  lastAmbient: null,
  visited: false,
};

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadPrefs(): Prefs {
  const s = storage();
  if (!s) return { ...DEFAULTS };
  try {
    const raw = s.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrefs(patch: Partial<Prefs>): void {
  const s = storage();
  if (!s) return;
  const next = { ...loadPrefs(), ...patch };
  s.setItem(KEY, JSON.stringify(next));
}

/**
 * Clear all persisted preferences (quick-260714-dc3) — loadPrefs() returns
 * DEFAULTS afterwards. Never throws.
 */
export function resetPrefs(): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}
