import { describe, it, expect } from "vitest";
import { OfflineAudioContext, AudioContext } from "node-web-audio-api";
import { createAmbientLayer } from "../../src/audio/layers/ambient";
import { createBrownNoiseBuffer } from "../../src/audio/noise";
import { AudioEngine } from "../../src/audio/engine";
import type { AmbientKind } from "../../src/audio/types";
import { maxAbs, countZeroCrossings } from "./helpers";

const KINDS: AmbientKind[] = ["rain", "ocean", "wind", "brown"];

async function renderAmbient(kind: AmbientKind): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, 88200, 44100); // 2 seconds
  const layer = createAmbientLayer(ctx as unknown as BaseAudioContext, kind);
  layer.output.connect(ctx.destination as unknown as AudioNode);
  layer.start(0);
  const buffer = await ctx.startRendering();
  return buffer.getChannelData(0);
}

function rms(data: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / data.length);
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
