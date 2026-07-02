import { describe, it, expect } from "vitest";
import { OfflineAudioContext } from "node-web-audio-api";
import { AudioEngine } from "../../src/audio/engine";
import { maxAbs, rmsSeries } from "./helpers";

async function renderMonaural(): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, 44100, 44100);
  const engine = new AudioEngine(ctx as unknown as BaseAudioContext);
  engine.play("monaural");
  return await ctx.startRendering();
}

describe("MonauralLayer (ENG-03)", () => {
  it("outputs identical L and R channels (works on speakers)", async () => {
    const buffer = await renderMonaural();
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    let maxDiff = 0;
    for (let i = 0; i < left.length; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(left[i] - right[i]));
    }
    expect(maxDiff).toBeLessThan(1e-6);
  });

  it("produces an amplitude beat envelope at ~10 Hz", async () => {
    const buffer = await renderMonaural();
    const data = buffer.getChannelData(0);
    const windowSize = Math.floor(44100 * 0.005); // 5 ms
    const series = rmsSeries(data, windowSize);

    // Count local minima in the RMS series (beat troughs).
    let minima = 0;
    for (let i = 1; i < series.length - 1; i++) {
      if (
        series[i] < series[i - 1] &&
        series[i] <= series[i + 1] &&
        series[i] < 0.1
      ) {
        minima++;
        i += 5; // skip flat trough neighborhood
      }
    }
    expect(minima).toBeGreaterThanOrEqual(9);
    expect(minima).toBeLessThanOrEqual(11);
  });

  it("never clips (pre-gain 0.5 summing)", async () => {
    const buffer = await renderMonaural();
    expect(maxAbs(buffer.getChannelData(0))).toBeLessThanOrEqual(1.0);
  });

  it("engine registry now has all three entrainment kinds", async () => {
    const ctx = new OfflineAudioContext(2, 44100, 44100);
    const engine = new AudioEngine(ctx as unknown as BaseAudioContext);
    expect(engine.implementedKinds).toEqual(
      expect.arrayContaining(["binaural", "isochronic", "monaural"]),
    );
  });
});
