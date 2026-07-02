import type { SoundLayer } from "../types";
import { FADE_SEC } from "../constants";
import { fadeIn, fadeOut } from "../ramps";

/** Solfeggio pure tone (ENG-04): a single sine oscillator at the given Hz. */
export function createSolfeggioLayer(
  ctx: BaseAudioContext,
  toneHz: number,
): SoundLayer {
  const osc = ctx.createOscillator();
  osc.frequency.value = toneHz;

  const output = ctx.createGain();
  output.gain.value = 0;
  osc.connect(output);

  return {
    output,
    start(t: number) {
      fadeIn(output.gain, 1, t);
      osc.start(t);
    },
    stop(t: number) {
      fadeOut(output.gain, t);
      osc.stop(t + FADE_SEC + 0.01);
    },
  };
}
