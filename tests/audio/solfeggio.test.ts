import { describe, it, expect } from "vitest";
import { OfflineAudioContext } from "node-web-audio-api";
import { createSolfeggioLayer } from "../../src/audio/layers/solfeggio";
import { AudioEngine } from "../../src/audio/engine";
import { DEMO, SOLFEGGIO } from "../../src/audio/constants";
import { countZeroCrossings } from "./helpers";

describe("SolfeggioLayer (ENG-04)", () => {
  it("plays a pure 528 Hz tone", async () => {
    const ctx = new OfflineAudioContext(1, 44100, 44100);
    const layer = createSolfeggioLayer(ctx as unknown as BaseAudioContext, 528);
    layer.output.connect(ctx.destination as unknown as AudioNode);
    layer.start(0);
    const buffer = await ctx.startRendering();
    const crossings = countZeroCrossings(buffer.getChannelData(0));
    expect(crossings).toBeGreaterThanOrEqual(522);
    expect(crossings).toBeLessThanOrEqual(534);
  });

  it("solfeggio doubles as entrainment carrier (isochronic demo uses 528)", () => {
    expect(DEMO.isochronic.carrier).toBe(SOLFEGGIO.healing);
  });

  it("is registered in the engine", () => {
    const ctx = new OfflineAudioContext(2, 44100, 44100);
    const engine = new AudioEngine(ctx as unknown as BaseAudioContext);
    expect(engine.implementedKinds).toContain("solfeggio");
  });
});
