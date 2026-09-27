/**
 * The Scene catalog: every painted Scene (from `public/scenes/`, generated
 * with GPT Image), how SceneArt lays its live layers over it, and which
 * Scenes a Clinician or the Admin can pick for Custom Audio. Presets keep
 * their own Scenes (a Scene id equals its Preset id); Landing and the
 * session-complete sunrise are not pickable.
 */

type Rays = "down" | "burst";
type Particles = "motes" | "pollen" | "sand" | "snow";

/**
 * Where SceneArt draws the live layers over a painting. Coordinates are in
 * the painting's own pixels, so glows, glints and rays stay pinned to the
 * moon, sun and water they belong to at any crop.
 */
export interface SceneSpec {
  width: number;
  height: number;
  /** Placeholder colour shown until the painting has loaded. */
  tint: string;
  /** Colour of the light source, its bloom, rays and glints. */
  glow: string;
  /** Light source: x, y and bloom radius. */
  light: [number, number, number];
  /** Height of the horizon band the mist drifts along. */
  mist: number;
  /** Twinkling stars down to this height (night scenes only). */
  stars?: number;
  /** Column of water or wet sand that reflects the light. */
  reflection?: { x: number; top: number; bottom: number };
  rays?: Rays;
  /** Where the down-rays land. */
  rayTarget?: [number, number];
  particles?: Particles;
  /** Region particles live in: x, y, width, height. */
  particleBox?: [number, number, number, number];
  aurora?: boolean;
  meteor?: boolean;
}

const WIDE = { width: 1536, height: 864 };
const CARD = { width: 1536, height: 1024 };

/** Every Scene SceneArt can paint, by id. */
export const SCENE_SPECS: Record<string, SceneSpec> = {
  landing: {
    ...WIDE, tint: "#0f2237", glow: "#ffd9a8", light: [1249, 254, 60], mist: 478,
    stars: 380, reflection: { x: 1247, top: 494, bottom: 864 }, meteor: true,
  },
  complete: {
    ...WIDE, tint: "#8fb0c4", glow: "#ffe2ae", light: [1257, 322, 60], mist: 470,
    reflection: { x: 1250, top: 494, bottom: 864 }, rays: "burst",
  },
  "deep-sleep": {
    ...CARD, tint: "#1b2148", glow: "#e3e8ff", light: [985, 220, 90], mist: 640,
    stars: 470, meteor: true,
  },
  "deep-meditation": {
    ...CARD, tint: "#6a6788", glow: "#ffe7c2", light: [767, 238, 70], mist: 760,
    rays: "down", rayTarget: [767, 1024],
  },
  "healing-relaxation": {
    ...CARD, tint: "#e7a58b", glow: "#ffd7a0", light: [1047, 444, 70], mist: 470,
    reflection: { x: 1060, top: 486, bottom: 900 },
  },
  "anxiety-relief": {
    ...CARD, tint: "#4d6e5c", glow: "#fff4cf", light: [1440, 70, 120], mist: 640,
    rays: "down", rayTarget: [760, 800],
    particles: "motes", particleBox: [640, 160, 820, 640],
  },
  focus: {
    ...CARD, tint: "#5b7ea8", glow: "#ffcf85", light: [767, 487, 70], mist: 580,
    rays: "burst",
  },
  energy: {
    ...CARD, tint: "#c7704f", glow: "#ffcc7a", light: [1055, 270, 80], mist: 330,
    rays: "burst", particles: "sand", particleBox: [0, 380, 1536, 480],
  },
  creativity: {
    ...CARD, tint: "#12305a", glow: "#8ef0d0", light: [760, 330, 260], mist: 670,
    stars: 520, aurora: true, reflection: { x: 780, top: 700, bottom: 1010 },
    particles: "snow", particleBox: [0, 0, 1536, 1024],
  },
  "power-nap": {
    ...CARD, tint: "#b9c8d6", glow: "#fff1d0", light: [1020, 340, 110], mist: 720,
    rays: "down", rayTarget: [700, 1024],
    particles: "pollen", particleBox: [0, 560, 1536, 460],
  },
  // Painted for Custom Audio only: no Preset shows them.
  "deep-ocean": {
    ...CARD, tint: "#0e648f", glow: "#d8f8ec", light: [1281, 40, 90], mist: 780,
    rays: "down", rayTarget: [900, 700],
    particles: "motes", particleBox: [150, 180, 1250, 560],
  },
  nebula: {
    ...CARD, tint: "#4a3f68", glow: "#ffd6b8", light: [751, 347, 70], mist: 620,
    stars: 700, meteor: true,
  },
  "lavender-field": {
    ...CARD, tint: "#af8a98", glow: "#ffeccb", light: [1253, 161, 90], mist: 560,
    rays: "down", rayTarget: [1120, 560],
    particles: "pollen", particleBox: [260, 470, 1276, 520],
  },
};

/** How the Scene picker groups Scenes: painted places, or calm scientific illustrations. */
export type SceneGroup = "Nature" | "Science";

export const SCENE_GROUPS: readonly SceneGroup[] = ["Nature", "Science"];

/** A Scene a Clinician or the Admin can pick for Custom Audio. */
export interface PickableScene {
  id: string;
  group: SceneGroup;
  /** Names the picture, never a result it promises (ADR-025). */
  label: string;
}

/** Every pickable Scene, in picker order: the eight Preset Scenes, then the paintings made for Custom Audio. */
export const PICKABLE_SCENES: readonly PickableScene[] = [
  { id: "deep-sleep", group: "Nature", label: "Moon over Clouds" },
  { id: "deep-meditation", group: "Nature", label: "Misty Peak" },
  { id: "healing-relaxation", group: "Nature", label: "Sunset Shore" },
  { id: "anxiety-relief", group: "Nature", label: "Forest Light" },
  { id: "focus", group: "Nature", label: "Dawn Hills" },
  { id: "energy", group: "Nature", label: "Desert Dunes" },
  { id: "creativity", group: "Nature", label: "Aurora Lake" },
  { id: "power-nap", group: "Nature", label: "Summer Meadow" },
  { id: "deep-ocean", group: "Nature", label: "Deep Ocean" },
  { id: "nebula", group: "Nature", label: "Nebula" },
  { id: "lavender-field", group: "Nature", label: "Lavender Field" },
];

/**
 * The Scene of Custom Audio whose designer chose none: for now the Meditating
 * Scene. Specs store no id for it, so changing the default here moves every
 * such Custom Audio along.
 */
export const DEFAULT_SCENE = "deep-meditation";

export function isPickableScene(id: unknown): id is string {
  return PICKABLE_SCENES.some((scene) => scene.id === id);
}

/** The Scene a Custom Audio spec shows: its chosen one, else the default. */
export function sceneOf(spec: { sceneId?: string }): string {
  return spec.sceneId ?? DEFAULT_SCENE;
}

/** Where a Scene's painting is served, at 768 px (precached) or 1536 px. */
export function scenePainting(id: string, size: 768 | 1536): string {
  return `/scenes/${id}-${size}.webp`;
}
