import { describe, it, expect, beforeAll } from "vitest";
import { OfflineAudioContext } from "node-web-audio-api";
import { createAmbientLayer, createShuffledLoopLayer } from "../../src/audio/layers/ambient";
import { preloadAmbientSamples } from "../../src/audio/ambientSamples";
import { createBrownNoiseBuffer, NOISE_REFERENCE_RATE } from "../../src/audio/noise";
import { AMBIENT_KINDS } from "../../src/audio/types";
import type { SoundLayer } from "../../src/audio/types";
import { installAmbientAssetsFromDisk, maxAbs, rmsSeries, seededRandom } from "./helpers";

function rms(data: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / data.length);
}

/** Run `fn` with Math.random seeded, restoring it after (see docs/knowledge/testing.md). */
function seeded<T>(seed: number, fn: () => T): T {
  const random = Math.random;
  Math.random = seededRandom(seed);
  try {
    return fn();
  } finally {
    Math.random = random;
  }
}

describe("Ambient layers", () => {
  beforeAll(installAmbientAssetsFromDisk);

  it.each(AMBIENT_KINDS)("%s plays audibly without clipping", async (kind) => {
    const ctx = new OfflineAudioContext(2, 3 * 44100, 44100);
    await preloadAmbientSamples(ctx as unknown as BaseAudioContext, [kind]);
    // Seeded: brown noise's random walk peaks past 1.0 on a few seeds (the
    // engines' sample ceiling catches that; this test pins the layer itself).
    const layer = seeded(1, () => createAmbientLayer(ctx as unknown as BaseAudioContext, kind));
    layer.output.connect(ctx.destination as unknown as AudioNode);
    seeded(1, () => layer.start(0));
    const buffer = await ctx.startRendering();
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      // After the first segment's 1 s ease-in.
      const tail = buffer.getChannelData(channel).slice(1.5 * 44100);
      expect(rms(tail), `${kind} should be audible`).toBeGreaterThan(0.01);
      expect(maxAbs(tail), `${kind} should not clip`).toBeLessThanOrEqual(1.0);
    }
  }, 30000);

  it("brown noise buffer loop seam is crossfaded (no periodic tick)", () => {
    const ctx = new OfflineAudioContext(1, 44100, 44100);
    const buffer = createBrownNoiseBuffer(ctx as unknown as BaseAudioContext);
    const data = buffer.getChannelData(0);
    expect(Math.abs(data[data.length - 1] - data[0])).toBeLessThan(0.05);
  });
});

/** Low rate keeps multi-minute renders fast; the layer is rate-agnostic. */
const LOOP_SR = 8000;
const LOOP_SECONDS = 30;

/** Uncorrelated white noise standing in for a 30 s recording. */
function whiteLoop(ctx: OfflineAudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, LOOP_SECONDS * LOOP_SR, LOOP_SR);
  const data = buffer.getChannelData(0);
  const random = seededRandom(3);
  for (let i = 0; i < data.length; i++) data[i] = (random() * 2 - 1) * 0.5;
  return buffer as unknown as AudioBuffer;
}

async function renderLoop(
  seconds: number,
  play: (layer: SoundLayer, ctx: OfflineAudioContext) => void | Promise<void>,
  loop: (ctx: OfflineAudioContext) => AudioBuffer | Promise<AudioBuffer> = whiteLoop,
): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, seconds * LOOP_SR, LOOP_SR);
  const layer = createShuffledLoopLayer(ctx as unknown as BaseAudioContext, loop(ctx));
  layer.output.connect(ctx.destination as unknown as AudioNode);
  await seeded(11, () => play(layer, ctx));
  const buffer = await ctx.startRendering();
  return buffer.getChannelData(0).slice(0);
}

describe("Recorded ambience playback (ADR-026)", () => {
  it("holds a steady level through every crossfade, well past the loop's length", async () => {
    const data = await renderLoop(120, (layer) => layer.start(0));
    // Skip the first segment's ease-in.
    const levels = rmsSeries(data.slice(2 * LOOP_SR), LOOP_SR / 4).map(
      (v) => 20 * Math.log10(v),
    );
    const sorted = [...levels].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    // A gap, a linear (−3 dB) crossfade, or a segment played past the
    // recording's end all show up as a dip here.
    for (const [i, level] of levels.entries()) {
      expect(Math.abs(level - median), `window ${i} (${2 + i / 4} s)`).toBeLessThan(1);
    }
  }, 30000);

  it("never repeats with the recording's period", async () => {
    const data = await renderLoop(90, (layer) => layer.start(0));
    const period = LOOP_SECONDS * LOOP_SR;
    const a = data.slice(2 * LOOP_SR, 2 * LOOP_SR + period);
    const b = data.slice(2 * LOOP_SR + period, 2 * LOOP_SR + 2 * period);
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    const correlation = dot / (a.length * rms(a) * rms(b));
    // A plain looping source scores 1 here.
    expect(Math.abs(correlation)).toBeLessThan(0.2);
  }, 30000);

  it("falls silent at its stop time, however far ahead it had scheduled", async () => {
    const data = await renderLoop(60, (layer) => {
      layer.start(0);
      layer.stop(40);
    });
    expect(rms(data.slice(30 * LOOP_SR, 39 * LOOP_SR))).toBeGreaterThan(0.1);
    expect(maxAbs(data.slice(Math.ceil(40.1 * LOOP_SR)))).toBe(0);
  }, 30000);

  it("eases in once a loop that was still decoding at start arrives", async () => {
    let arrive: (buffer: AudioBuffer) => void = () => {};
    const decoding = new Promise<AudioBuffer>((resolve) => (arrive = resolve));
    const data = await renderLoop(
      4,
      async (layer, ctx) => {
        layer.start(0);
        arrive(whiteLoop(ctx));
        // The layer subscribed to `decoding` first, so it has scheduled by now.
        await decoding;
      },
      () => decoding,
    );
    // After the first segment's 1 s ease-in.
    expect(rms(data.slice(2 * LOOP_SR))).toBeGreaterThan(0.1);
  }, 30000);
});

/** Analysis bands in Hz, below the Nyquist of every tested device rate. */
const BANDS_HZ = [125, 500, 2000];
const RATE_SECONDS = 6;
/** Skip the layer fade-in before measuring. */
const RATE_SKIP_SECONDS = 0.5;
/** Device rates to match. */
const DEVICE_RATES = [16000, 22050, 48000, 96000, 192000];

/**
 * RMS of brown noise inside fixed-Hz analysis bands at `sampleRate`. Brown
 * noise that sounds the same on every device measures the same per-band
 * level at every rate.
 */
async function brownBandLevels(sampleRate: number): Promise<number[]> {
  const ctx = new OfflineAudioContext(BANDS_HZ.length, RATE_SECONDS * sampleRate, sampleRate);
  // Seed directly rather than vi.spyOn: a spy records every call, and a
  // 192 kHz noise buffer needs millions of them.
  const layer = seeded(7, () => createAmbientLayer(ctx as unknown as BaseAudioContext, "brown"));
  const merger = ctx.createChannelMerger(BANDS_HZ.length);
  BANDS_HZ.forEach((hz, i) => {
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = hz;
    band.Q.value = 1.4; // ~1 octave wide
    layer.output.connect(band as unknown as AudioNode);
    band.connect(merger, 0, i);
  });
  merger.connect(ctx.destination);
  layer.start(0);
  const buffer = await ctx.startRendering();
  const skip = RATE_SKIP_SECONDS * sampleRate;
  return BANDS_HZ.map((_, i) => rms(buffer.getChannelData(i).slice(skip)));
}

describe("Brown noise is identical across device sample rates", () => {
  it("keeps its per-band level within 1 dB of the tuned rate", async () => {
    const reference = await brownBandLevels(NOISE_REFERENCE_RATE);
    for (const rate of DEVICE_RATES) {
      const levels = await brownBandLevels(rate);
      BANDS_HZ.forEach((hz, i) => {
        const deltaDb = 20 * Math.log10(levels[i] / reference[i]);
        expect(Math.abs(deltaDb), `${rate} Hz, ${hz} Hz band`).toBeLessThan(1);
      });
    }
  }, 60000);
});
