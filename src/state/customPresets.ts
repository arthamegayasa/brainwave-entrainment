import type { BuilderLayerSpec, CustomSession } from "../audio/builder";

/**
 * Custom preset persistence (BLD-04): localStorage + JSON export/import.
 * All imported numbers are clamped to safe ranges — imports are untrusted.
 */

const STORAGE_KEY = "serenade.customSessions.v1";

const clamp = (v: number, min: number, max: number): number =>
  Number.isFinite(v) ? Math.min(Math.max(v, min), max) : min;

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function listCustomSessions(): CustomSession[] {
  const s = storage();
  if (!s) return [];
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => sanitizeSession(entry))
      .filter((entry): entry is CustomSession => entry !== null);
  } catch {
    return [];
  }
}

export function saveCustomSession(session: CustomSession): void {
  const s = storage();
  if (!s) return;
  const all = listCustomSessions().filter((c) => c.id !== session.id);
  all.push(session);
  s.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function deleteCustomSession(id: string): void {
  const s = storage();
  if (!s) return;
  const all = listCustomSessions().filter((c) => c.id !== id);
  s.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function exportSessionJSON(session: CustomSession): string {
  return JSON.stringify(session, null, 2);
}

/** Parse + sanitize a JSON string; throws Error (Indonesian) when invalid. */
export function importSessionJSON(json: string): CustomSession {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Not a valid JSON file");
  }
  const session = sanitizeSession(parsed);
  if (!session) throw new Error("Unrecognized preset format");
  return session;
}

/**
 * Clamp + validate an untrusted session spec (imports AND cloud jsonb).
 * Every spec read from Supabase MUST pass through here before it can reach
 * the audio engine — never feed raw jsonb to BuilderEngine.
 */
export function sanitizeSession(value: unknown): CustomSession | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.layers) || typeof v.curve !== "object" || v.curve === null) {
    return null;
  }
  const curve = v.curve as Record<string, unknown>;
  const layers = dedupeLayerIds(
    v.layers
      .slice(0, MAX_LAYERS)
      .map((layer) => sanitizeLayer(layer))
      .filter((layer): layer is BuilderLayerSpec => layer !== null),
  );
  if (layers.length === 0) return null;

  return {
    version: 1,
    id: typeof v.id === "string" && v.id ? v.id : `custom-${Date.now()}`,
    name:
      typeof v.name === "string" && v.name.trim()
        ? v.name.trim().slice(0, 60)
        : "Custom Session",
    curve: {
      startHz: clamp(Number(curve.startHz), 0.5, 50),
      targetHz: clamp(Number(curve.targetHz), 0.5, 50),
      endHz:
        curve.endHz === null || curve.endHz === undefined
          ? null
          : clamp(Number(curve.endHz), 0.5, 50),
      rampInMin: clamp(Number(curve.rampInMin), 0.1, 60),
      rampOutMin: clamp(Number(curve.rampOutMin), 0, 30),
    },
    layers,
    createdAt:
      typeof v.createdAt === "string" ? v.createdAt : new Date().toISOString(),
  };
}

/**
 * Hard cap on layers per session. Each layer allocates real audio nodes and
 * (for ambient types) multi-second noise buffers — an unbounded count in an
 * untrusted spec is a client-exhaustion vector, and summed layers past this
 * point only add clipping, not depth.
 */
const MAX_LAYERS = 12;

/**
 * BuilderEngine tracks live layers in a Map keyed by layer id; a duplicate id
 * from an untrusted spec would overwrite the Map entry and orphan an already-
 * running layer that stop() can never reach. Regenerate colliding ids.
 */
function dedupeLayerIds(layers: BuilderLayerSpec[]): BuilderLayerSpec[] {
  const seen = new Set<string>();
  return layers.map((layer) => {
    let id = layer.id;
    while (seen.has(id)) {
      id = `layer-${Math.random().toString(36).slice(2, 9)}`;
    }
    seen.add(id);
    return id === layer.id ? layer : { ...layer, id };
  });
}

const LAYER_TYPES = [
  "binaural",
  "isochronic",
  "monaural",
  "pure",
  "rain",
  "ocean",
  "wind",
  "brown",
];

function sanitizeLayer(value: unknown): BuilderLayerSpec | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.type !== "string" || !LAYER_TYPES.includes(v.type)) return null;
  return {
    id:
      typeof v.id === "string" && v.id
        ? v.id
        : `layer-${Math.random().toString(36).slice(2, 9)}`,
    type: v.type as BuilderLayerSpec["type"],
    carrierHz: clamp(Number(v.carrierHz), 20, 1500),
    beatMode: v.beatMode === "fixed" ? "fixed" : "follow",
    fixedBeatHz: clamp(Number(v.fixedBeatHz), 0.5, 50),
    gain: clamp(Number(v.gain), 0, 1),
  };
}
