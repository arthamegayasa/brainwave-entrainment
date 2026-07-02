/**
 * Noise buffer generators. AudioBufferSourceNode + loop — no deprecated
 * main-thread audio processing nodes.
 */

export function createWhiteNoiseBuffer(
  ctx: BaseAudioContext,
  seconds: number = 5,
): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

export function createBrownNoiseBuffer(
  ctx: BaseAudioContext,
  seconds: number = 10,
): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  // Leaky integrator over white noise.
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }

  // Crossfade the final ~50 ms toward data[0] so the loop seam doesn't tick:
  // a random walk ends far from where it started.
  const fadeSamples = Math.floor(ctx.sampleRate * 0.05);
  const target = data[0];
  for (let i = 0; i < fadeSamples; i++) {
    const idx = length - fadeSamples + i;
    const progress = i / (fadeSamples - 1);
    data[idx] = data[idx] * (1 - progress) + target * progress;
  }

  return buffer;
}
