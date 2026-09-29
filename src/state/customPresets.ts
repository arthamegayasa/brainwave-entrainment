import { AMBIENT_KINDS } from "../audio/types";
import { MAX_MOVE_MIN } from "../audio/builder";
import type { BuilderLayerSpec, CustomSession, Journey, JourneyPoint } from "../audio/builder";
import { DEFAULT_SWINGS, EASINGS, MAX_SWINGS, MIN_SWINGS } from "../audio/schedule";
import type { Easing } from "../audio/schedule";
import { isPickableScene } from "../ui/scenes";

/**
 * Custom preset persistence: localStorage + JSON export/import.
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
  if (!Array.isArray(v.layers)) return null;
  const journey = sanitizeJourney(v.journey) ?? journeyOfCurve(v.curve);
  if (!journey) return null;
  const layers = dedupeLayerIds(
    v.layers
      .slice(0, MAX_LAYERS)
      .map((layer) => sanitizeLayer(layer))
      .filter((layer): layer is BuilderLayerSpec => layer !== null),
  );
  if (layers.length === 0) return null;

  return {
    version: 2,
    id: typeof v.id === "string" && v.id ? v.id : `custom-${Date.now()}`,
    name:
      typeof v.name === "string" && v.name.trim()
        ? v.name.trim().slice(0, 60)
        : "Custom Session",
    journey,
    layers,
    // Only a pickable Scene is kept: without one the default shows, and it
    // stays absent so the spec follows whatever the default becomes.
    ...(isPickableScene(v.sceneId) && { sceneId: v.sceneId }),
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
export const MAX_LAYERS = 12;

/** Points per Journey after its Start; the chart and the editor stay readable. */
export const MAX_JOURNEY_POINTS = 12;

const beatHz = (v: unknown) => clamp(Number(v), 0.5, 50);
const moveMin = (v: unknown) => clamp(Number(v), 0.1, MAX_MOVE_MIN);

/**
 * Fast → slow and Slow → fast, offered before ADR-029, play as Proportional:
 * within 0.83 Hz of the old move when it matched its direction.
 */
const RETIRED_EASINGS: Record<string, Easing> = { "ease-out": "exponential", "ease-in": "exponential" };

function sanitizeEasing(value: unknown): Easing {
  if (EASINGS.includes(value as Easing)) return value as Easing;
  return (typeof value === "string" && RETIRED_EASINGS[value]) || "linear";
}

function sanitizeJourney(value: unknown): Journey | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.points)) return null;
  const points = v.points
    .slice(0, MAX_JOURNEY_POINTS)
    .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
    .map((p): JourneyPoint => {
      const easing = sanitizeEasing(p.easing);
      const swings = Number(p.swings);
      return {
        hz: beatHz(p.hz),
        minutes: moveMin(p.minutes),
        easing,
        ...(easing === "wave" && {
          swings: Number.isFinite(swings) ? Math.round(clamp(swings, MIN_SWINGS, MAX_SWINGS)) : DEFAULT_SWINGS,
        }),
      };
    });
  if (points.length === 0) return null;
  const holdAt = Number(v.holdAt);
  return {
    startHz: beatHz(v.startHz),
    points,
    holdAt: Number.isInteger(holdAt) ? clamp(holdAt, 0, points.length - 1) : points.length - 1,
  };
}

/**
 * A version 1 spec's curve (Start, Target, optional End) as the Journey that
 * plays it: Target timed from the start and held, End timed from the end.
 * Saved sessions, Audio Bank specs, and exported files still carry it.
 */
function journeyOfCurve(value: unknown): Journey | null {
  if (typeof value !== "object" || value === null) return null;
  const c = value as Record<string, unknown>;
  const points: JourneyPoint[] = [
    { hz: beatHz(c.targetHz), minutes: moveMin(c.rampInMin), easing: "linear" },
  ];
  if (c.endHz !== null && c.endHz !== undefined && Number(c.rampOutMin) > 0) {
    points.push({ hz: beatHz(c.endHz), minutes: moveMin(c.rampOutMin), easing: "linear" });
  }
  return { startHz: beatHz(c.startHz), points, holdAt: 0 };
}

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

const LAYER_TYPES: readonly string[] = [
  "binaural",
  "isochronic",
  "monaural",
  "pure",
  ...AMBIENT_KINDS,
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
    fixedBeatHz: beatHz(v.fixedBeatHz),
    gain: clamp(Number(v.gain), 0, 1),
  };
}
