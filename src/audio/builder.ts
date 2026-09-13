import type { AmbientKind, RampableLayer, SoundLayer } from "./types";
import { buildSchedule } from "./schedule";
import type { SessionSchedule } from "./schedule";
import { fadeIn, fadeOut, setGainSmooth } from "./ramps";
import { createBinauralSessionLayer } from "./layers/binaural";
import { createIsochronicSessionLayer } from "./layers/isochronic";
import { createMonauralSessionLayer } from "./layers/monaural";
import { createSolfeggioLayer } from "./layers/solfeggio";
import { createAmbientLayer } from "./layers/ambient";
import { createSampleCeiling } from "./sampleCeiling";
import type { Preset } from "./presets";

export type EntrainmentLayerType = "binaural" | "isochronic" | "monaural";
export type BuilderLayerType = EntrainmentLayerType | "pure" | AmbientKind;

/** One layer in a custom session (BLD-01). */
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

/** The custom session ramp curve (BLD-03) — same model as presets. */
export interface BuilderCurve {
  startHz: number;
  targetHz: number;
  /** null = no closing ramp. */
  endHz: number | null;
  rampInMin: number;
  rampOutMin: number;
}

/** A saved custom session (BLD-04). */
export interface CustomSession {
  version: 1;
  id: string;
  name: string;
  curve: BuilderCurve;
  layers: BuilderLayerSpec[];
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

const AMBIENT_TYPES: AmbientKind[] = ["rain", "ocean", "wind", "brown"];

export function isAmbient(type: BuilderLayerType): type is AmbientKind {
  return (AMBIENT_TYPES as string[]).includes(type);
}

/** Curve → schedule, reusing the preset scheduler under the hood. */
function curveSchedule(
  curve: BuilderCurve,
  durationSec: number | null,
): SessionSchedule {
  const pseudo: Preset = {
    id: "custom",
    name: "custom",
    tagline: "",
    emoji: "",
    band: "theta",
    targetHz: curve.targetHz,
    startHz: curve.startHz,
    endHz: curve.endHz,
    rampInMin: curve.rampInMin,
    rampOutMin: curve.rampOutMin,
    carrierHz: 0,
    defaultAmbient: null,
    premium: false,
  };
  return buildSchedule(pseudo, durationSec);
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
  private schedule: SessionSchedule | null = null;
  private curve: BuilderCurve | null = null;
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
    curve: BuilderCurve,
    durationMin: number | null,
  ): void {
    if (this.isRunning) this.stop();
    const durationSec = durationMin === null ? null : durationMin * 60;
    this.curve = curve;
    this.schedule = curveSchedule(curve, durationSec);
    const t = this.ctx.currentTime;
    this.startTime = t;
    this.endTime = durationSec === null ? null : t + durationSec;

    for (const spec of layers) this.attach(spec, t);

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
    this.curve = null;
    this.endTime = null;
  }

  /** Add a layer to a running session (no-op when idle). */
  addLayer(spec: BuilderLayerSpec): void {
    if (!this.schedule) return;
    this.attach(spec, this.ctx.currentTime);
    if (this.endTime !== null) this.live.get(spec.id)?.layer.stop(this.endTime);
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

  private attach(spec: BuilderLayerSpec, t: number): void {
    const gain = this.ctx.createGain();
    gain.gain.value = Math.min(Math.max(spec.gain, 0), 1);
    gain.connect(this.masterGain);

    let layer: SoundLayer | RampableLayer;
    if (isEntrainment(spec.type)) {
      const startBeat =
        spec.beatMode === "follow" && this.curve
          ? this.curve.startHz
          : spec.fixedBeatHz;
      const create =
        spec.type === "binaural"
          ? createBinauralSessionLayer
          : spec.type === "isochronic"
            ? createIsochronicSessionLayer
            : createMonauralSessionLayer;
      const rampable = create(this.ctx, spec.carrierHz, startBeat);
      if (spec.beatMode === "follow" && this.schedule) {
        // Offset schedule so mid-session layers join the curve where it is now.
        const elapsed = t - this.startTime;
        const shifted = this.schedule.points
          .map((p) => ({ time: Math.max(0, p.time - elapsed), hz: p.hz }))
          .filter((p, i, arr) => i === arr.length - 1 || p.time >= 0);
        rampable.scheduleBeat(shifted.length ? shifted : this.schedule.points, t);
      }
      layer = rampable;
    } else if (spec.type === "pure") {
      layer = createSolfeggioLayer(this.ctx, spec.carrierHz);
    } else {
      layer = createAmbientLayer(this.ctx, spec.type);
    }

    layer.output.connect(gain);
    layer.start(t);
    this.live.set(spec.id, { spec, layer, gain });
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
