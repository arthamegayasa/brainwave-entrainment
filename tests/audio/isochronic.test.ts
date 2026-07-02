import { describe, it, expect } from "vitest";
import { OfflineAudioContext } from "node-web-audio-api";
import { createIsochronicLayer, buildPulseCurve } from "../../src/audio/layers/isochronic";
import { AudioEngine } from "../../src/audio/engine";
import { envelope, countPulseOnsets, maxDelta } from "./helpers";

async function renderIsochronic(beat: number): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, 44100, 44100);
  const layer = createIsochronicLayer(
    ctx as unknown as BaseAudioContext,
    { carrier: 528, beat },
  );
  layer.output.connect(ctx.destination as unknown as AudioNode);
  layer.start(0);
  const buffer = await ctx.startRendering();
  return buffer.getChannelData(0);
}

describe("IsochronicLayer (ENG-02)", () => {
  it("pulses EXACTLY beat Hz times per second (double-pulse guard)", async () => {
    const data = await renderIsochronic(10);
    const env = envelope(data, Math.floor(44100 * 0.002)); // ~2ms smoothing
    const onsets = countPulseOnsets(env, 0.1, 0.05);
    expect(onsets).toBe(10); // a non-monotonic curve would produce 20
  });

  it("has real silent gaps between pulses (isochronic, not shallow tremolo)", async () => {
    const data = await renderIsochronic(10);
    const env = envelope(data, Math.floor(44100 * 0.002));
    // Sample envelope minima between pulses: collect the minimum in each
    // inter-pulse window after the first pulse.
    let minBetween = Infinity;
    const period = 4410; // samples per beat at 10 Hz
    for (let p = 1; p < 9; p++) {
      // Look at the second half of each period, before the next rise.
      const start = p * period - Math.floor(period * 0.2);
      const end = p * period - Math.floor(period * 0.02);
      for (let i = start; i < end; i++) {
        minBetween = Math.min(minBetween, env[i]);
      }
    }
    expect(minBetween).toBeLessThan(0.01);
  });

  it("is click-free (raised-cosine envelope, ENG-06)", async () => {
    const data = await renderIsochronic(10);
    expect(maxDelta(data)).toBeLessThan(0.15);
  });

  it("pulse curve is monotonic non-decreasing (Pitfall 1 invariant)", () => {
    const curve = buildPulseCurve(2048);
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1]);
    }
  });

  it("is registered in the engine", () => {
    const ctx = new OfflineAudioContext(2, 44100, 44100);
    const engine = new AudioEngine(ctx as unknown as BaseAudioContext);
    expect(engine.implementedKinds).toContain("isochronic");
  });
});
