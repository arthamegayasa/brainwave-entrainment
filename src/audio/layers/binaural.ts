import type { RampableLayer, SoundLayer, ToneParams } from "../types";
import { FADE_SEC } from "../constants";
import { fadeIn, fadeOut } from "../ramps";

/**
 * Binaural beats (ENG-01): carrier on the LEFT ear, carrier+beat on the RIGHT.
 * The brain perceives the difference as a beat — requires headphones.
 */
export function createBinauralLayer(
  ctx: BaseAudioContext,
  params: ToneParams,
): SoundLayer {
  const oscL = ctx.createOscillator();
  oscL.frequency.value = params.carrier;
  const oscR = ctx.createOscillator();
  oscR.frequency.value = params.carrier + params.beat;

  const gainL = ctx.createGain();
  const gainR = ctx.createGain();
  const merger = ctx.createChannelMerger(2);
  const output = ctx.createGain();
  output.gain.value = 0;

  oscL.connect(gainL);
  gainL.connect(merger, 0, 0); // LEFT
  oscR.connect(gainR);
  gainR.connect(merger, 0, 1); // RIGHT
  merger.connect(output);

  return {
    output,
    start(t: number) {
      fadeIn(output.gain, 1, t);
      oscL.start(t);
      oscR.start(t);
    },
    stop(t: number) {
      fadeOut(output.gain, t);
      const stopAt = t + FADE_SEC + 0.01;
      oscL.stop(stopAt);
      oscR.stop(stopAt);
    },
  };
}

/**
 * Session variant: the beat is rampable (SCH-01). Beat lives entirely on the
 * RIGHT oscillator — oscR.frequency = carrier + beat(t); L stays at carrier.
 */
export function createBinauralSessionLayer(
  ctx: BaseAudioContext,
  carrier: number,
  startBeat: number,
): RampableLayer {
  const oscL = ctx.createOscillator();
  oscL.frequency.value = carrier;
  const oscR = ctx.createOscillator();
  oscR.frequency.value = carrier + startBeat;

  const merger = ctx.createChannelMerger(2);
  const output = ctx.createGain();
  output.gain.value = 0;
  oscL.connect(merger, 0, 0);
  oscR.connect(merger, 0, 1);
  merger.connect(output);

  const layer: RampableLayer = {
    output,
    onEnded: null,
    start(t: number) {
      fadeIn(output.gain, 1, t);
      oscL.start(t);
      oscR.start(t);
      oscL.onended = () => layer.onEnded?.();
    },
    stop(t: number) {
      fadeOut(output.gain, t);
      const stopAt = t + FADE_SEC + 0.01;
      oscL.stop(stopAt);
      oscR.stop(stopAt);
    },
    scheduleBeat(points, t0) {
      const param = oscR.frequency;
      param.cancelScheduledValues(t0);
      param.setValueAtTime(carrier + points[0].hz, t0 + points[0].time);
      for (let i = 1; i < points.length; i++) {
        param.linearRampToValueAtTime(carrier + points[i].hz, t0 + points[i].time);
      }
    },
  };
  return layer;
}
