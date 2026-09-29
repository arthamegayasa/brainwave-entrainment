import { AMBIENT_KINDS } from "./types";
import type { AmbientKind, RampableLayer, SoundLayer } from "./types";
import { beatAt, beatPath } from "./schedule";
import type { Easing, SchedulePoint, SessionSchedule } from "./schedule";
import { fadeIn, fadeOut, setGainSmooth } from "./ramps";
import { createBinauralSessionLayer } from "./layers/binaural";
import { createIsochronicSessionLayer } from "./layers/isochronic";
import { createMonauralSessionLayer } from "./layers/monaural";
import { createSolfeggioLayer } from "./layers/solfeggio";
import { createAmbientLayer } from "./layers/ambient";
import { createSampleCeiling } from "./sampleCeiling";
import { DURATIONS_MIN } from "./presets";

export type EntrainmentLayerType = "binaural" | "isochronic" | "monaural";
export type BuilderLayerType = EntrainmentLayerType | "pure" | AmbientKind;

/** One layer in a custom session. */
export interface BuilderLayerSpec {
  id: string;
  type: BuilderLayerType;
  /** Tone frequency (carrier for entrainment, pitch for pure). Ignored for ambient. */
  carrierHz: number;
  /** follow = beat follows the session curve; fixed = constant beat. */
  beatMode: "follow" | "fixed";
  fixedBeatHz: number;
  /** Per-layer volume 0..1. */
  gain: number;
}

/** A Beat the Journey reaches, some minutes after the point before it. */
export interface JourneyPoint {
  hz: number;
  /** Minutes the Beat takes to get here from the point before, or from the Start. */
  minutes: number;
  /** How the Beat moves on the way here. */
  easing: Easing;
  /** A wave's arrivals at this Beat, counting the last (2–8); only with a wave. */
  swings?: number;
}

/**
 * The Beat over a Custom Audio (ADR-028): a Start, then points reached one
 * after another. The Hold point's Beat stays for the time a Play has beyond
 * the Journey; the points after it close the session.
 */
export interface Journey {
  startHz: number;
  /** In order; at least one. */
  points: JourneyPoint[];
  /** Index into `points` of the Hold. */
  holdAt: number;
}

/** A saved custom session. */
export interface CustomSession {
  version: 2;
  id: string;
  name: string;
  journey: Journey;
  layers: BuilderLayerSpec[];
  /**
   * The Scene its designer chose (a pickable id, src/ui/scenes.ts); absent
   * means the default Scene, whichever it is when shown (see sceneOf).
   */
  sceneId?: string;
  createdAt: string;
}

export const ENTRAINMENT_TYPES: EntrainmentLayerType[] = [
  "binaural",
  "isochronic",
  "monaural",
];

export function isEntrainment(type: BuilderLayerType): type is EntrainmentLayerType {
  return (ENTRAINMENT_TYPES as string[]).includes(type);
}

export function isAmbient(type: BuilderLayerType): type is AmbientKind {
  return (AMBIENT_KINDS as readonly string[]).includes(type);
}

/** The main Beat's layer: the first entrainment layer, if there is one. */
export function mainLayer(layers: readonly BuilderLayerSpec[]): BuilderLayerSpec | undefined {
  return layers.find((layer) => isEntrainment(layer.type));
}

/** Whether any entrainment layer rides the Journey (otherwise every Beat is fixed). */
export function followsJourney(layers: readonly BuilderLayerSpec[]): boolean {
  return layers.some((layer) => isEntrainment(layer.type) && layer.beatMode === "follow");
}

/** The Beat a session aims at: its main layer's fixed Beat, or where its Journey holds. */
export function targetBeatHz(session: Pick<CustomSession, "journey" | "layers">): number {
  const main = mainLayer(session.layers);
  if (main?.beatMode === "fixed") return main.fixedBeatHz;
  const { points, holdAt } = session.journey;
  return points[Math.min(holdAt, points.length - 1)].hz;
}

/** Total minutes of the Journey's moves, Hold excluded. */
export function journeyMinutes(journey: Journey): number {
  return journey.points.reduce((sum, p) => sum + p.minutes, 0);
}

/** One move may take a whole timed Play: the longest one. */
export const MAX_MOVE_MIN = Math.max(...DURATIONS_MIN.filter((min): min is number => min !== null));

/** The shortest move the Studio offers. */
const MIN_MOVE_MIN = 0.5;

/** How a `durationSec` Play times the moves: 1 when they fit, less when it runs them faster. */
export function moveScale(journey: Journey, durationSec: number | null): number {
  const movesSec = journeyMinutes(journey) * 60;
  return durationSec !== null && movesSec > durationSec ? durationSec / movesSec : 1;
}

/**
 * Journey → schedule; the Studio draws the same schedule it plays.
 * - The points up to the Hold are timed from the start, the points after it
 *   from the end; the Hold fills the time between.
 * - A Play shorter than the moves runs every move proportionally faster, so
 *   its closing still ends the session.
 * - durationSec === null → infinite: the moves up to the Hold, then the Hold
 *   until stopped.
 */
export function journeySchedule(journey: Journey, durationSec: number | null): SessionSchedule {
  const holdAt = Math.min(journey.holdAt, journey.points.length - 1);
  const lead = journey.points.slice(0, holdAt + 1);
  const close = journey.points.slice(holdAt + 1);
  const scale = moveScale(journey, durationSec);

  const points: SchedulePoint[] = [{ time: 0, hz: journey.startHz }];
  let t = 0;
  for (const p of lead) {
    t += p.minutes * 60 * scale;
    points.push({ time: t, hz: p.hz, easing: p.easing, swings: p.swings });
  }
  const holdIndex = points.length - 1;
  if (durationSec === null) return { points, endSec: null, holdIndex };

  t = durationSec - close.reduce((sum, p) => sum + p.minutes * 60 * scale, 0);
  points.push({ time: Math.max(t, points[holdIndex].time), hz: points[holdIndex].hz });
  for (const p of close) {
    t += p.minutes * 60 * scale;
    points.push({ time: t, hz: p.hz, easing: p.easing, swings: p.swings });
  }
  points[points.length - 1].time = durationSec;
  return { points, endSec: durationSec, holdIndex };
}

/**
 * The Journey with point `index` arriving `atSec` into a `durationSec` Play,
 * as dragging it along the chart does; minutes snap to halves. The points
 * around it stay put: the move after it gives or takes the time, except
 * after the Hold point, where the Hold does (never past its end, so the
 * moves still fit the Play). A closing's last point sits on the end and
 * does not move.
 */
export function retimePoint(
  journey: Journey,
  index: number,
  atSec: number,
  durationSec: number | null,
): Journey {
  const { points, holdAt } = journey;
  const last = index === points.length - 1;
  if (index > holdAt && last) return journey;
  const schedule = journeySchedule(journey, durationSec);
  const scale = moveScale(journey, durationSec);
  // The schedule has the Hold's end as an extra point before the closing.
  const beforeSec = schedule.points[index <= holdAt ? index : index + 1].time;
  const wanted = Math.round(((atSec - beforeSec) / scale / 60) * 2) / 2;
  const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
  const withMinutes = (changes: Record<number, number>): Journey => ({
    ...journey,
    points: points.map((p, i) => (i in changes ? { ...p, minutes: Math.round(changes[i] * 100) / 100 } : p)),
  });

  if (index === holdAt) {
    const holdSec =
      durationSec === null ? Infinity : schedule.points[holdAt + 2].time - schedule.points[holdAt + 1].time;
    const max = Math.min(MAX_MOVE_MIN, points[index].minutes + holdSec / scale / 60);
    return withMinutes({ [index]: clamp(wanted, MIN_MOVE_MIN, max) });
  }
  const pair = points[index].minutes + points[index + 1].minutes;
  const minutes = clamp(wanted, Math.max(MIN_MOVE_MIN, pair - MAX_MOVE_MIN), Math.min(MAX_MOVE_MIN, pair - MIN_MOVE_MIN));
  return withMinutes({ [index]: minutes, [index + 1]: pair - minutes });
}

/**
 * The schedule of the session's Beat, as Now Playing and the Player show it:
 * the Journey, unless the main layer keeps a fixed Beat.
 */
export function sessionBeat(
  layers: readonly BuilderLayerSpec[],
  journey: SessionSchedule,
): SessionSchedule {
  const main = mainLayer(layers);
  if (main?.beatMode !== "fixed") return journey;
  return { points: [{ time: 0, hz: main.fixedBeatHz }], endSec: journey.endSec, holdIndex: 0 };
}

interface LiveLayer {
  spec: BuilderLayerSpec;
  layer: SoundLayer | RampableLayer;
  gain: GainNode;
}

/**
 * Live multi-layer session engine for the Studio (Phase 4). Layers can be
 * added, removed, and re-tuned while audio runs — every transition fades.
 */
export class BuilderEngine {
  private readonly ctx: BaseAudioContext;
  private readonly masterGain: GainNode;
  private live = new Map<string, LiveLayer>();
  /** The Journey's schedule, which follow layers ride. */
  private schedule: SessionSchedule | null = null;
  private startTime = 0;
  private endTime: number | null = null;
  private master = 0.8;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0;
    // Compress layered peaks before the final sample ceiling.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 4;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    this.masterGain.connect(limiter);
    const ceiling = createSampleCeiling(ctx);
    limiter.connect(ceiling);
    ceiling.connect(ctx.destination);
  }

  get isRunning(): boolean {
    return this.live.size > 0;
  }

  start(
    layers: BuilderLayerSpec[],
    journey: Journey,
    durationMin: number | null,
  ): void {
    if (this.isRunning) this.stop();
    const durationSec = durationMin === null ? null : durationMin * 60;
    this.schedule = journeySchedule(journey, durationSec);
    // Build before reading the clock (see SessionEngine.start): noise
    // buffers are slow, and the audio thread does not wait for them.
    const built = layers.map((spec) => this.build(spec, 0));
    const t = this.ctx.currentTime;
    this.startTime = t;
    this.endTime = durationSec === null ? null : t + durationSec;

    for (const entry of built) this.launch(entry, t);

    fadeIn(this.masterGain.gain, this.master, t, 1.5);
    if (this.endTime !== null) {
      const fadeStart = Math.max(t, this.endTime - 5);
      this.masterGain.gain.setValueAtTime(this.master, fadeStart);
      this.masterGain.gain.linearRampToValueAtTime(0.0001, this.endTime);
      for (const { layer } of this.live.values()) layer.stop(this.endTime);
    }
  }

  stop(fadeSec = 0.4): void {
    const t = this.ctx.currentTime;
    fadeOut(this.masterGain.gain, t, fadeSec);
    for (const { layer } of this.live.values()) layer.stop(t + fadeSec);
    this.live.clear();
    this.schedule = null;
    this.endTime = null;
  }

  /** Add a layer to a running session (no-op when idle). */
  addLayer(spec: BuilderLayerSpec): void {
    if (!this.schedule) return;
    const entry = this.build(spec, this.ctx.currentTime - this.startTime);
    this.launch(entry, this.ctx.currentTime);
    if (this.endTime !== null) entry.layer.stop(this.endTime);
  }

  removeLayer(id: string): void {
    const entry = this.live.get(id);
    if (!entry) return;
    entry.layer.stop(this.ctx.currentTime);
    this.live.delete(id);
  }

  /** Re-tune a running layer: rebuild it with fades (click-free swap). */
  updateLayer(spec: BuilderLayerSpec): void {
    if (!this.live.has(spec.id)) return;
    const existing = this.live.get(spec.id)!;
    if (existing.spec.gain !== spec.gain && sameSound(existing.spec, spec)) {
      existing.spec = spec;
      setGainSmooth(existing.gain.gain, spec.gain, this.ctx.currentTime);
      return;
    }
    this.removeLayer(spec.id);
    this.addLayer(spec);
  }

  setMasterVolume(v: number): void {
    this.master = Math.min(Math.max(v, 0), 1);
    setGainSmooth(this.masterGain.gain, this.master, this.ctx.currentTime);
  }

  /**
   * The Journey's schedule the follow layers ride; `sessionBeat` turns it
   * into the session's Beat for Now Playing.
   */
  getSchedule(): SessionSchedule | null {
    return this.schedule;
  }

  progress(): { elapsedSec: number; remainingSec: number | null } {
    const elapsed = this.ctx.currentTime - this.startTime;
    return {
      elapsedSec: this.isRunning ? elapsed : 0,
      remainingSec:
        this.endTime === null || !this.isRunning
          ? null
          : Math.max(0, this.endTime - this.ctx.currentTime),
    };
  }

  /**
   * Create a layer's nodes, unstarted — the slow part (noise buffers). A
   * follow layer is tuned to the Journey's Beat `atSec` into the session.
   */
  private build(spec: BuilderLayerSpec, atSec: number): LiveLayer {
    const gain = this.ctx.createGain();
    gain.gain.value = Math.min(Math.max(spec.gain, 0), 1);
    gain.connect(this.masterGain);

    let layer: SoundLayer | RampableLayer;
    if (isEntrainment(spec.type)) {
      const startBeat =
        spec.beatMode === "follow" && this.schedule
          ? beatAt(this.schedule, atSec)
          : spec.fixedBeatHz;
      const create =
        spec.type === "binaural"
          ? createBinauralSessionLayer
          : spec.type === "isochronic"
            ? createIsochronicSessionLayer
            : createMonauralSessionLayer;
      layer = create(this.ctx, spec.carrierHz, startBeat);
    } else if (spec.type === "pure") {
      layer = createSolfeggioLayer(this.ctx, spec.carrierHz);
    } else {
      layer = createAmbientLayer(this.ctx, spec.type);
    }
    layer.output.connect(gain);
    return { spec, layer, gain };
  }

  /** Start a built layer at `t`; follow layers join the Journey where it is now. */
  private launch(entry: LiveLayer, t: number): void {
    const { spec, layer } = entry;
    if (spec.beatMode === "follow" && this.schedule && "scheduleBeat" in layer) {
      layer.scheduleBeat(beatPath(this.schedule, t - this.startTime), t);
    }
    layer.start(t);
    this.live.set(spec.id, entry);
  }
}

function sameSound(a: BuilderLayerSpec, b: BuilderLayerSpec): boolean {
  return (
    a.type === b.type &&
    a.carrierHz === b.carrierHz &&
    a.beatMode === b.beatMode &&
    a.fixedBeatHz === b.fixedBeatHz
  );
}
