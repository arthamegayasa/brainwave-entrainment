import type { LayerFactory, SoundKind, SoundLayer } from "./types";
import { DEMO } from "./constants";
import { fadeIn, fadeOut, setGainSmooth } from "./ramps";
import { createBinauralLayer } from "./layers/binaural";
import { createIsochronicLayer } from "./layers/isochronic";
import { createMonauralLayer } from "./layers/monaural";
import { createSolfeggioLayer } from "./layers/solfeggio";
import { createAmbientLayer } from "./layers/ambient";

const LAYER_FACTORIES: Partial<Record<SoundKind, LayerFactory>> = {
  binaural: (ctx) => createBinauralLayer(ctx, DEMO.binaural),
  isochronic: (ctx) => createIsochronicLayer(ctx, DEMO.isochronic),
  monaural: (ctx) => createMonauralLayer(ctx, DEMO.monaural),
  solfeggio: (ctx) => createSolfeggioLayer(ctx, DEMO.solfeggio.tone),
  rain: (ctx) => createAmbientLayer(ctx, "rain"),
  ocean: (ctx) => createAmbientLayer(ctx, "ocean"),
  wind: (ctx) => createAmbientLayer(ctx, "wind"),
  brown: (ctx) => createAmbientLayer(ctx, "brown"),
};

/** Kinds available before an engine instance exists (App renders buttons from this). */
export const REGISTERED_KINDS = Object.keys(LAYER_FACTORIES) as SoundKind[];

const DEFAULT_VOLUME = 0.8;

/**
 * Facade over the Web Audio graph. The AudioContext is injected (never created
 * here) so the engine stays pure TypeScript and unit-testable offline (ENG-07),
 * and so the context can be created/resumed inside a user gesture (UI-08).
 */
export class AudioEngine {
  private readonly ctx: BaseAudioContext;
  private readonly masterGain: GainNode;
  private activeLayer: SoundLayer | null = null;
  private volume = DEFAULT_VOLUME;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0; // start silent; every audible change ramps
    this.masterGain.connect(ctx.destination);
  }

  /** Stop the active layer (fade), build `kind` from the registry, start with fade-in. */
  play(kind: SoundKind): void {
    const factory = LAYER_FACTORIES[kind];
    if (!factory) {
      throw new Error(`Sound kind not registered: ${kind}`);
    }
    const t = this.ctx.currentTime;
    if (this.activeLayer) {
      this.activeLayer.stop(t);
      this.activeLayer = null;
    }
    const layer = factory(this.ctx);
    layer.output.connect(this.masterGain);
    layer.start(t);
    fadeIn(this.masterGain.gain, this.volume, t);
    this.activeLayer = layer;
  }

  /** Fade out the master then stop the active layer. Safe to call while idle. */
  stop(): void {
    const t = this.ctx.currentTime;
    fadeOut(this.masterGain.gain, t);
    if (this.activeLayer) {
      this.activeLayer.stop(t);
      this.activeLayer = null;
    }
  }

  /** Ramp master gain to clamp(v, 0, 1) — never above 1.0 (hearing safety). */
  setMasterVolume(v: number): void {
    this.volume = Math.min(Math.max(v, 0), 1);
    setGainSmooth(this.masterGain.gain, this.volume, this.ctx.currentTime);
  }

  /** Last clamped master volume target (exposed for tests and UI). */
  get masterVolumeTarget(): number {
    return this.volume;
  }

  get implementedKinds(): SoundKind[] {
    return Object.keys(LAYER_FACTORIES) as SoundKind[];
  }
}
