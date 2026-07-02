import type { RampableLayer, SoundLayer, ToneParams } from "../types";
import { FADE_SEC } from "../constants";
import { fadeIn, fadeOut } from "../ramps";

/**
 * Build the WaveShaper pulse curve: MONOTONIC non-decreasing raised-cosine.
 * Off while LFO is negative, smooth 0→1 rise for x in 0..0.8, plateau after.
 * A curve that rises then falls fires twice per LFO cycle (double-pulse bug).
 */
export function buildPulseCurve(n: number = 2048): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const p = Math.min(Math.max(x / 0.8, 0), 1);
    curve[i] = 0.5 * (1 - Math.cos(Math.PI * p));
  }
  return curve;
}

/**
 * Isochronic tones (ENG-02): a carrier pulsed on/off at beat Hz with a smooth
 * envelope. LFO → WaveShaper → envGain.gain keeps the beat rate a single
 * AudioParam (lfo.frequency) so Phase 2 can ramp it continuously (ADR-006).
 */
export function createIsochronicLayer(
  ctx: BaseAudioContext,
  params: ToneParams,
): SoundLayer {
  const carrierOsc = ctx.createOscillator();
  carrierOsc.frequency.value = params.carrier;

  // Envelope gain starts at 0 — the envelope comes 100% from the shaper.
  const envGain = ctx.createGain();
  envGain.gain.value = 0;

  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = params.beat;

  const shaper = ctx.createWaveShaper();
  shaper.curve = buildPulseCurve();

  const output = ctx.createGain();
  output.gain.value = 0;

  carrierOsc.connect(envGain);
  envGain.connect(output);
  lfo.connect(shaper);
  shaper.connect(envGain.gain); // audio-rate envelope modulation

  return {
    output,
    start(t: number) {
      fadeIn(output.gain, 1, t);
      carrierOsc.start(t);
      lfo.start(t);
    },
    stop(t: number) {
      fadeOut(output.gain, t);
      const stopAt = t + FADE_SEC + 0.01;
      carrierOsc.stop(stopAt);
      lfo.stop(stopAt);
    },
  };
}

/**
 * Session variant: pulse rate is rampable (SCH-01) — the beat is a single
 * AudioParam (lfo.frequency), which is exactly why the LFO architecture won.
 */
export function createIsochronicSessionLayer(
  ctx: BaseAudioContext,
  carrier: number,
  startBeat: number,
): RampableLayer {
  const carrierOsc = ctx.createOscillator();
  carrierOsc.frequency.value = carrier;
  const envGain = ctx.createGain();
  envGain.gain.value = 0;
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = startBeat;
  const shaper = ctx.createWaveShaper();
  shaper.curve = buildPulseCurve();
  const output = ctx.createGain();
  output.gain.value = 0;

  carrierOsc.connect(envGain);
  envGain.connect(output);
  lfo.connect(shaper);
  shaper.connect(envGain.gain);

  const layer: RampableLayer = {
    output,
    onEnded: null,
    start(t: number) {
      fadeIn(output.gain, 1, t);
      carrierOsc.start(t);
      lfo.start(t);
      carrierOsc.onended = () => layer.onEnded?.();
    },
    stop(t: number) {
      fadeOut(output.gain, t);
      const stopAt = t + FADE_SEC + 0.01;
      carrierOsc.stop(stopAt);
      lfo.stop(stopAt);
    },
    scheduleBeat(points, t0) {
      const param = lfo.frequency;
      param.cancelScheduledValues(t0);
      param.setValueAtTime(points[0].hz, t0 + points[0].time);
      for (let i = 1; i < points.length; i++) {
        param.linearRampToValueAtTime(points[i].hz, t0 + points[i].time);
      }
    },
  };
  return layer;
}
