import type { SoundLayer, ToneParams } from "../types";
import { FADE_SEC } from "../constants";
import { fadeIn, fadeOut } from "../ramps";

/**
 * Monaural beats (ENG-03): two tones summed BEFORE reaching the ear — the beat
 * exists physically in the air, so it works on speakers. Pre-gain 0.5 per
 * oscillator (set at construction, before audio runs) guarantees the sum
 * never clips.
 */
export function createMonauralLayer(
  ctx: BaseAudioContext,
  params: ToneParams,
): SoundLayer {
  const oscA = ctx.createOscillator();
  oscA.frequency.value = params.carrier;
  const oscB = ctx.createOscillator();
  oscB.frequency.value = params.carrier + params.beat;

  const gainA = ctx.createGain();
  gainA.gain.value = 0.5;
  const gainB = ctx.createGain();
  gainB.gain.value = 0.5;

  // Web Audio unity summing: both connect into one gain node.
  const sum = ctx.createGain();
  const output = ctx.createGain();
  output.gain.value = 0;

  oscA.connect(gainA);
  gainA.connect(sum);
  oscB.connect(gainB);
  gainB.connect(sum);
  sum.connect(output);

  return {
    output,
    start(t: number) {
      fadeIn(output.gain, 1, t);
      oscA.start(t);
      oscB.start(t);
    },
    stop(t: number) {
      fadeOut(output.gain, t);
      const stopAt = t + FADE_SEC + 0.01;
      oscA.stop(stopAt);
      oscB.stop(stopAt);
    },
  };
}
