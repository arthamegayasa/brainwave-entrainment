import type { AmbientKind, RampableLayer, SoundLayer } from "./types";
import type { Preset } from "./presets";
import { buildSchedule, beatAt, phaseAt } from "./schedule";
import type { SessionSchedule, SessionPhase } from "./schedule";
import { fadeIn, fadeOut, setGainSmooth } from "./ramps";
import { createBinauralSessionLayer } from "./layers/binaural";
import { createIsochronicSessionLayer } from "./layers/isochronic";
import { createSolfeggioLayer } from "./layers/solfeggio";
import { createAmbientLayer } from "./layers/ambient";

export type ListeningMode = "headphone" | "speaker";

export interface SessionConfig {
  preset: Preset;
  /** Minutes, or null for infinite (∞). */
  durationMin: number | null;
  /** headphone → binaural, speaker → isochronic (PRE-03). */
  mode: ListeningMode;
  ambient: AmbientKind | null;
  /** Optional extra pure solfeggio tone layered under the entrainment. */
  solfeggioTone?: number | null;
}

export interface SessionVolumes {
  master: number;
  entrainment: number;
  ambient: number;
  solfeggio: number;
}

export interface SessionProgress {
  running: boolean;
  elapsedSec: number;
  /** null while idle or in infinite mode. */
  remainingSec: number | null;
  currentBeatHz: number;
  carrierHz: number;
  phase: SessionPhase;
}

const END_FADE_SEC = 5;

export const DEFAULT_VOLUMES: SessionVolumes = {
  master: 0.8,
  entrainment: 0.9,
  ambient: 0.6,
  solfeggio: 0.35,
};

/**
 * Orchestrates one guided session (Phase 2 core). All timing runs on the
 * audio clock: the beat curve, end fade, and source stops are scheduled
 * up-front against AudioContext.currentTime (SCH-03) so nothing drifts even
 * when the tab is throttled. Auto-stop is sample-accurate (SCH-04).
 */
export class SessionEngine {
  private readonly ctx: BaseAudioContext;
  private readonly masterGain: GainNode;
  private readonly entrainGain: GainNode;
  private readonly ambientGain: GainNode;
  private readonly solfeggioGain: GainNode;

  private entrainment: RampableLayer | null = null;
  private ambientLayer: SoundLayer | null = null;
  private solfeggioLayer: SoundLayer | null = null;

  private schedule: SessionSchedule | null = null;
  private startTime = 0;
  private endTime: number | null = null;
  private config: SessionConfig | null = null;
  private volumes: SessionVolumes = { ...DEFAULT_VOLUMES };

  /** Fires when a finite session reaches its scheduled end. */
  onEnded: (() => void) | null = null;

  constructor(ctx: BaseAudioContext, volumes?: Partial<SessionVolumes>) {
    this.ctx = ctx;
    this.volumes = { ...DEFAULT_VOLUMES, ...volumes };
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0;
    // Safety limiter: layered output must never clip or slam ears (T-01-03).
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 4;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    this.masterGain.connect(limiter);
    limiter.connect(ctx.destination);
    this.entrainGain = ctx.createGain();
    this.entrainGain.gain.value = this.volumes.entrainment;
    this.entrainGain.connect(this.masterGain);
    this.ambientGain = ctx.createGain();
    this.ambientGain.gain.value = this.volumes.ambient;
    this.ambientGain.connect(this.masterGain);
    this.solfeggioGain = ctx.createGain();
    this.solfeggioGain.gain.value = this.volumes.solfeggio;
    this.solfeggioGain.connect(this.masterGain);
  }

  get isRunning(): boolean {
    if (!this.config) return false;
    if (this.endTime !== null && this.ctx.currentTime >= this.endTime) return false;
    return true;
  }

  start(config: SessionConfig): void {
    if (this.config) this.stop();
    this.config = config;

    const durationSec = config.durationMin === null ? null : config.durationMin * 60;
    this.schedule = buildSchedule(config.preset, durationSec);

    const t = this.ctx.currentTime;
    this.startTime = t;
    this.endTime = durationSec === null ? null : t + durationSec;

    // Entrainment layer by listening mode (PRE-03).
    const startBeat = config.preset.startHz;
    this.entrainment =
      config.mode === "headphone"
        ? createBinauralSessionLayer(this.ctx, config.preset.carrierHz, startBeat)
        : createIsochronicSessionLayer(this.ctx, config.preset.carrierHz, startBeat);
    this.entrainment.output.connect(this.entrainGain);
    this.entrainment.start(t);
    this.entrainment.scheduleBeat(this.schedule.points, t);
    this.entrainment.onEnded = () => this.onEnded?.();

    if (config.ambient) this.attachAmbient(config.ambient, t);

    if (config.solfeggioTone) {
      this.solfeggioLayer = createSolfeggioLayer(this.ctx, config.solfeggioTone);
      this.solfeggioLayer.output.connect(this.solfeggioGain);
      this.solfeggioLayer.start(t);
    }

    // Master fade-in now; for finite sessions schedule the gentle end fade and
    // source stops up-front on the audio clock (SCH-04).
    fadeIn(this.masterGain.gain, this.volumes.master, t, 2);
    if (this.endTime !== null) {
      const fadeStart = Math.max(t, this.endTime - END_FADE_SEC);
      this.masterGain.gain.setValueAtTime(this.volumes.master, fadeStart);
      this.masterGain.gain.linearRampToValueAtTime(0.0001, this.endTime);
      this.entrainment.stop(this.endTime);
      this.ambientLayer?.stop(this.endTime);
      this.solfeggioLayer?.stop(this.endTime);
    }
  }

  /** Manual stop with a graceful fade (also used when switching presets). */
  stop(fadeSec: number = 0.5): void {
    const t = this.ctx.currentTime;
    fadeOut(this.masterGain.gain, t, fadeSec);
    const stopAt = t + fadeSec;
    this.entrainment?.stop(stopAt);
    this.ambientLayer?.stop(stopAt);
    this.solfeggioLayer?.stop(stopAt);
    this.entrainment = null;
    this.ambientLayer = null;
    this.solfeggioLayer = null;
    this.schedule = null;
    this.config = null;
    this.endTime = null;
  }

  /** Swap the ambient bed live without interrupting the session (UI-03). */
  setAmbient(kind: AmbientKind | null): void {
    if (!this.config) return;
    const t = this.ctx.currentTime;
    if (this.ambientLayer) {
      this.ambientLayer.stop(t);
      this.ambientLayer = null;
    }
    if (kind) {
      const layer = this.attachAmbient(kind, t);
      // Keep the pre-scheduled end stop for finite sessions.
      if (this.endTime !== null) layer.stop(this.endTime);
    }
    this.config = { ...this.config, ambient: kind };
  }

  setVolume(channel: keyof SessionVolumes, v: number): void {
    const clamped = Math.min(Math.max(v, 0), 1);
    this.volumes = { ...this.volumes, [channel]: clamped };
    const t = this.ctx.currentTime;
    const param =
      channel === "master"
        ? this.masterGain.gain
        : channel === "entrainment"
          ? this.entrainGain.gain
          : channel === "ambient"
            ? this.ambientGain.gain
            : this.solfeggioGain.gain;
    setGainSmooth(param, clamped, t);
  }

  getVolumes(): SessionVolumes {
    return { ...this.volumes };
  }

  getConfig(): SessionConfig | null {
    return this.config;
  }

  /** The active beat curve (for the session visualization, PWA-04). */
  getSchedule(): SessionSchedule | null {
    return this.schedule;
  }

  progress(): SessionProgress {
    if (!this.config || !this.schedule) {
      return {
        running: false,
        elapsedSec: 0,
        remainingSec: null,
        currentBeatHz: 0,
        carrierHz: 0,
        phase: "done",
      };
    }
    const elapsed = this.ctx.currentTime - this.startTime;
    const remaining =
      this.endTime === null ? null : Math.max(0, this.endTime - this.ctx.currentTime);
    return {
      running: this.isRunning,
      elapsedSec: elapsed,
      remainingSec: remaining,
      currentBeatHz: beatAt(this.schedule, elapsed),
      carrierHz: this.config.preset.carrierHz,
      phase: phaseAt(this.schedule, elapsed),
    };
  }

  private attachAmbient(kind: AmbientKind, t: number): SoundLayer {
    const layer = createAmbientLayer(this.ctx, kind);
    layer.output.connect(this.ambientGain);
    layer.start(t);
    this.ambientLayer = layer;
    return layer;
  }
}
