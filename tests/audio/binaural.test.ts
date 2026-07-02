import { describe, it, expect } from "vitest";
import { OfflineAudioContext } from "node-web-audio-api";
import { createBinauralLayer } from "../../src/audio/layers/binaural";
import { AudioEngine } from "../../src/audio/engine";
import { countZeroCrossings } from "./helpers";

describe("BinauralLayer (ENG-01)", () => {
  it("plays carrier on L and carrier+beat on R", async () => {
    const ctx = new OfflineAudioContext(2, 44100, 44100);
    const layer = createBinauralLayer(
      ctx as unknown as BaseAudioContext,
      { carrier: 200, beat: 10 },
    );
    layer.output.connect(ctx.destination as unknown as AudioNode);
    layer.start(0);
    const buffer = await ctx.startRendering();

    const left = countZeroCrossings(buffer.getChannelData(0));
    const right = countZeroCrossings(buffer.getChannelData(1));
    expect(left).toBeGreaterThanOrEqual(195);
    expect(left).toBeLessThanOrEqual(205);
    expect(right).toBeGreaterThanOrEqual(205);
    expect(right).toBeLessThanOrEqual(215);
  });
});

describe("AudioEngine", () => {
  it("play then stop renders without throwing and ends silent", async () => {
    const ctx = new OfflineAudioContext(2, 44100, 44100);
    const engine = new AudioEngine(ctx as unknown as BaseAudioContext);
    engine.play("binaural");
    engine.stop();
    const buffer = await ctx.startRendering();
    const data = buffer.getChannelData(0);
    const tail = data.slice(data.length - 100);
    for (const sample of tail) expect(Math.abs(sample)).toBeLessThan(0.001);
  });

  it("clamps master volume to <= 1.0", () => {
    const ctx = new OfflineAudioContext(2, 44100, 44100);
    const engine = new AudioEngine(ctx as unknown as BaseAudioContext);
    expect(() => engine.setMasterVolume(5)).not.toThrow();
    expect(engine.masterVolumeTarget).toBeLessThanOrEqual(1.0);
    engine.setMasterVolume(-2);
    expect(engine.masterVolumeTarget).toBeGreaterThanOrEqual(0);
  });

  it("registry exposes binaural and rejects unregistered kinds", () => {
    const ctx = new OfflineAudioContext(2, 44100, 44100);
    const engine = new AudioEngine(ctx as unknown as BaseAudioContext);
    expect(engine.implementedKinds).toContain("binaural");
    if (!engine.implementedKinds.includes("rain")) {
      expect(() => engine.play("rain")).toThrow();
    }
  });
});
