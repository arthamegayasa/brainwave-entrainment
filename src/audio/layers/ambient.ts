import type { AmbientKind, SoundLayer } from "../types";
import { DEMO, FADE_SEC } from "../constants";
import { fadeIn, fadeOut } from "../ramps";
import { createBrownNoiseBuffer, createWhiteNoiseBuffer } from "../noise";

interface Sources {
  nodes: AudioScheduledSourceNode[];
  tail: AudioNode;
}

function buildBrown(ctx: BaseAudioContext): Sources {
  const src = ctx.createBufferSource();
  src.buffer = createBrownNoiseBuffer(ctx);
  src.loop = true;
  return { nodes: [src], tail: src };
}

function buildOcean(ctx: BaseAudioContext): Sources {
  const p = DEMO.ambient.ocean; // ASSUMED — tune by ear (constants.ts only)
  const src = ctx.createBufferSource();
  src.buffer = createBrownNoiseBuffer(ctx);
  src.loop = true;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = p.lowpassHz;

  // Swell gain: intrinsic base level + LFO signal summed into gain.gain.
  const swell = ctx.createGain();
  swell.gain.value = p.baseGain;
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = p.lfoHz;
  const depth = ctx.createGain();
  depth.gain.value = p.lfoDepth;
  lfo.connect(depth);
  depth.connect(swell.gain);

  src.connect(lowpass);
  lowpass.connect(swell);
  return { nodes: [src, lfo], tail: swell };
}

function buildWind(ctx: BaseAudioContext): Sources {
  const p = DEMO.ambient.wind; // ASSUMED — tune by ear (constants.ts only)
  const src = ctx.createBufferSource();
  src.buffer = createWhiteNoiseBuffer(ctx);
  src.loop = true;

  const bandpass = ctx.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.value = p.bandpassHz;
  bandpass.Q.value = p.q;

  // Slow LFO sweeps the bandpass center — the "gust" motion.
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = p.lfoHz;
  const sweep = ctx.createGain();
  sweep.gain.value = p.sweepHz;
  lfo.connect(sweep);
  sweep.connect(bandpass.frequency);

  src.connect(bandpass);
  return { nodes: [src, lfo], tail: bandpass };
}

function buildRain(ctx: BaseAudioContext): Sources {
  const p = DEMO.ambient.rain; // ASSUMED — tune by ear (constants.ts only)
  const src = ctx.createBufferSource();
  src.buffer = createWhiteNoiseBuffer(ctx);
  src.loop = true;

  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = p.highpassHz;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = p.lowpassHz;
  const trim = ctx.createGain();
  trim.gain.value = p.baseGain;

  src.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(trim);
  return { nodes: [src], tail: trim };
}

const BUILDERS: Record<AmbientKind, (ctx: BaseAudioContext) => Sources> = {
  brown: buildBrown,
  ocean: buildOcean,
  wind: buildWind,
  rain: buildRain,
};

/** Synthesized ambient layer (ENG-05): rain, ocean, wind, brown noise. */
export function createAmbientLayer(
  ctx: BaseAudioContext,
  kind: AmbientKind,
): SoundLayer {
  const { nodes, tail } = BUILDERS[kind](ctx);
  const output = ctx.createGain();
  output.gain.value = 0;
  tail.connect(output);

  return {
    output,
    start(t: number) {
      fadeIn(output.gain, 1, t);
      for (const node of nodes) node.start(t);
    },
    stop(t: number) {
      fadeOut(output.gain, t);
      const stopAt = t + FADE_SEC + 0.01;
      for (const node of nodes) node.stop(stopAt);
    },
  };
}
