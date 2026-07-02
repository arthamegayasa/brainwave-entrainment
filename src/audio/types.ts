export type EntrainmentKind = "binaural" | "isochronic" | "monaural";
export type AmbientKind = "rain" | "ocean" | "wind" | "brown";
export type SoundKind = EntrainmentKind | "solfeggio" | AmbientKind;

export interface ToneParams {
  carrier: number; // Hz, > 0
  beat: number; // Hz, >= 0
}

/** One start/stop-able sound source with fades — implemented by every layer. */
export interface SoundLayer {
  /** Layer output node; the engine connects this to masterGain. */
  readonly output: GainNode;
  /** Start all sources at ctx time t (AudioContext seconds) with fade-in. */
  start(t: number): void;
  /** Fade out then stop sources; safe to call once. */
  stop(t: number): void;
}

export type LayerFactory = (ctx: BaseAudioContext) => SoundLayer;

/** A layer whose beat frequency can be scheduled along a curve (sessions). */
export interface RampableLayer extends SoundLayer {
  /**
   * Schedule the beat curve on the audio clock. `points[].time` are seconds
   * relative to `t0` (an absolute AudioContext time).
   */
  scheduleBeat(points: Array<{ time: number; hz: number }>, t0: number): void;
  /** Fires once when the layer's sources actually end (auto-stop). */
  onEnded?: (() => void) | null;
}
