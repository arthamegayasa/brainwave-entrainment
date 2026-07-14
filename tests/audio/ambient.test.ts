import { describe, it, expect } from "vitest";
import { OfflineAudioContext, AudioContext } from "node-web-audio-api";
import { createAmbientLayer } from "../../src/audio/layers/ambient";
import { createBrownNoiseBuffer } from "../../src/audio/noise";
import { AudioEngine } from "../../src/audio/engine";
import type { AmbientKind } from "../../src/audio/types";
import { maxAbs, countZeroCrossings, rmsSeries } from "./helpers";

const KINDS: AmbientKind[] = ["rain", "ocean", "wind", "brown"];

/** Long-render params for envelope/movement tests (reduced rate keeps them fast). */
const LONG_SR = 22050;
const LONG_SECONDS = 20;
/** Skip the ambient layer's initial fadeIn region before measuring modulation. */
const FADE_SKIP_SECONDS = 2;

async function renderAmbient(kind: AmbientKind): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, 88200, 44100); // 2 seconds
  const layer = createAmbientLayer(ctx as unknown as BaseAudioContext, kind);
  layer.output.connect(ctx.destination as unknown as AudioNode);
  layer.start(0);
  const buffer = await ctx.startRendering();
  // Copy: getChannelData views native memory; see renderAmbientLong note.
  return buffer.getChannelData(0).slice(0);
}

function rms(data: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / data.length);
}

/**
 * Render `seconds` of a kind at a reduced sample rate, fade region trimmed.
 * NOTE: must COPY via .slice() — node-web-audio-api's getChannelData returns
 * a view over native memory; retaining a .subarray() across a later render
 * lets GC free the backing AudioBuffer and segfaults the vitest worker.
 */
async function renderAmbientLong(kind: AmbientKind): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, LONG_SECONDS * LONG_SR, LONG_SR);
  const layer = createAmbientLayer(ctx as unknown as BaseAudioContext, kind);
  layer.output.connect(ctx.destination as unknown as AudioNode);
  layer.start(0);
  const buffer = await ctx.startRendering();
  return buffer.getChannelData(0).slice(FADE_SKIP_SECONDS * LONG_SR);
}

/** Zero-crossing count per window of `windowSize` samples. */
function zcrSeries(data: Float32Array, windowSize: number): number[] {
  const out: number[] = [];
  for (let start = 0; start + windowSize <= data.length; start += windowSize) {
    out.push(countZeroCrossings(data.subarray(start, start + windowSize)));
  }
  return out;
}

function maxMinRatio(values: number[]): number {
  return Math.max(...values) / Math.min(...values);
}

/** std / mean — dimensionless spread of a per-window series. */
function coefficientOfVariation(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

describe("Ambient layers (ENG-05)", () => {
  it("all four kinds render non-silent without clipping", async () => {
    for (const kind of KINDS) {
      const data = await renderAmbient(kind);
      expect(rms(data), `${kind} should be audible`).toBeGreaterThan(0.01);
      expect(maxAbs(data), `${kind} should not clip`).toBeLessThanOrEqual(1.0);
    }
  }, 30000);

  it("brown noise buffer loop seam is crossfaded (no periodic tick)", () => {
    const ctx = new OfflineAudioContext(1, 44100, 44100);
    const buffer = createBrownNoiseBuffer(ctx as unknown as BaseAudioContext);
    const data = buffer.getChannelData(0);
    expect(Math.abs(data[data.length - 1] - data[0])).toBeLessThan(0.05);
  });

  it("rain is spectrally brighter than ocean (filters wired correctly)", async () => {
    const rain = await renderAmbient("rain");
    const ocean = await renderAmbient("ocean");
    const zcrRain = countZeroCrossings(rain);
    const zcrOcean = countZeroCrossings(ocean);
    expect(zcrRain).toBeGreaterThan(3 * zcrOcean);
  }, 30000);

  it("engine registry contains all 8 kinds", () => {
    const ctx = new AudioContext();
    const engine = new AudioEngine(ctx as unknown as BaseAudioContext);
    expect(engine.implementedKinds.sort()).toEqual(
      ["binaural", "brown", "isochronic", "monaural", "ocean", "rain", "solfeggio", "wind"],
    );
    void ctx.close();
  });
});

/**
 * Spectral signature regression tests (QUICK-260714-P5O): pin every
 * AmbientKind to its sonic identity so future DEMO.ambient tuning cannot
 * silently make labels lie (e.g. "Rain sounds like Ocean").
 */
describe("Ambience spectral signatures (QUICK-260714-P5O)", () => {
  it("ZCR ordering: rain (bright hiss) > wind (mid whoosh) > ocean (low rumble)", async () => {
    const zcrRain = countZeroCrossings(await renderAmbient("rain"));
    const zcrWind = countZeroCrossings(await renderAmbient("wind"));
    const zcrOcean = countZeroCrossings(await renderAmbient("ocean"));
    expect(zcrRain, "rain must sit above wind").toBeGreaterThan(zcrWind);
    expect(zcrWind, "wind must sit above ocean").toBeGreaterThan(zcrOcean);
  }, 60000);

  it("ocean swells audibly; brown noise stays static", async () => {
    const ocean = await renderAmbientLong("ocean");
    const brown = await renderAmbientLong("brown");
    const oceanRatio = maxMinRatio(rmsSeries(ocean, LONG_SR));
    const brownRatio = maxMinRatio(rmsSeries(brown, LONG_SR));
    // Audible wave swell: loudest 1 s window clearly above the quietest.
    expect(oceanRatio, "ocean must swell").toBeGreaterThanOrEqual(1.5);
    // Brown is a static rumble — no intentional amplitude modulation.
    expect(brownRatio, "brown must stay static").toBeLessThanOrEqual(1.2);
    // Regression for "Ocean sounds like Brown Noise": strict separation.
    expect(oceanRatio, "ocean must swell more than brown").toBeGreaterThan(
      brownRatio,
    );
  }, 60000);

  it("wind gusts move spectrally; rain stays a steady hiss", async () => {
    const wind = await renderAmbientLong("wind");
    const rain = await renderAmbientLong("rain");
    const windCv = coefficientOfVariation(zcrSeries(wind, LONG_SR));
    const rainCv = coefficientOfVariation(zcrSeries(rain, LONG_SR));
    // The bandpass-center sweep must move the wind's dominant pitch.
    expect(windCv, "wind ZCR must move over time").toBeGreaterThan(0.1);
    // Rain's static filters keep per-window ZCR near-constant.
    expect(rainCv, "rain ZCR must stay steady").toBeLessThan(0.05);
    // Regression for "Wind/Rain confusable": strict ordering with margin.
    expect(windCv, "wind must move far more than rain").toBeGreaterThan(
      3 * rainCv,
    );
  }, 60000);
});
