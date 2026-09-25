/**
 * Noise buffer generators. AudioBufferSourceNode + loop — no deprecated
 * main-thread audio processing nodes.
 *
 * Device sample rates differ (44.1/48 kHz typical, 16 kHz Bluetooth
 * hands-free, 96/192 kHz on USB DACs), so every per-sample constant here is
 * derived from ctx.sampleRate. The ambient beds were tuned at
 * NOISE_REFERENCE_RATE; at any other rate they must produce the same power
 * per Hz in the audible band, or the same ambience plays louder, quieter, or
 * brighter depending on the listener's hardware.
 */

/** Sample rate the ambient beds were tuned (and spectrally pinned) at. */
export const NOISE_REFERENCE_RATE = 44100;

/**
 * Per-sample amplitude scale that keeps white noise's power per Hz equal to
 * the reference rate. A fixed per-sample variance spreads over 0..Nyquist,
 * so without it a 96 kHz device plays filtered ambience ~3.4 dB quieter and a
 * 16 kHz route ~4.4 dB louder than a 44.1 kHz one.
 */
function densityScale(sampleRate: number): number {
  return Math.sqrt(sampleRate / NOISE_REFERENCE_RATE);
}

export function createWhiteNoiseBuffer(
  ctx: BaseAudioContext,
  seconds: number = 5,
): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const scale = densityScale(ctx.sampleRate);
  for (let i = 0; i < length; i++) {
    data[i] = (Math.random() * 2 - 1) * scale;
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

  // Leaky integrator over white noise: y = a·y + (1 − a)·x. The tuned leak
  // (a = 1/1.02 at 44.1 kHz) is a ~139 Hz one-pole corner; a = e^(−2π·fc/fs)
  // keeps that corner fixed in Hz instead of drifting with the device rate.
  const leak = Math.pow(1.02, -NOISE_REFERENCE_RATE / ctx.sampleRate);
  const scale = densityScale(ctx.sampleRate);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = (Math.random() * 2 - 1) * scale;
    last = leak * last + (1 - leak) * white;
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
