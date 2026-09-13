import { describe, it, expect } from "vitest";
import { OfflineAudioContext } from "node-web-audio-api";
import { createSampleCeiling } from "../../src/audio/sampleCeiling";

describe("sample ceiling", () => {
  it("preserves an ordinary stereo waveform and clamps only overrange samples", async () => {
    const ctx = new OfflineAudioContext(2, 256, 44100);
    const audioCtx = ctx as unknown as BaseAudioContext;
    const input = audioCtx.createBuffer(2, 256, 44100);
    const originals = [0, 1].map((channel) => {
      const data = Float32Array.from({ length: 256 }, (_, i) =>
        0.75 * Math.sin((i + channel * 17) * 0.1),
      );
      data[0] = -2;
      data[1] = -1;
      data[254] = 1;
      data[255] = 2;
      input.copyToChannel(data, channel);
      return data;
    });
    const source = audioCtx.createBufferSource();
    source.buffer = input;
    const ceiling = createSampleCeiling(audioCtx);
    source.connect(ceiling);
    ceiling.connect(audioCtx.destination);
    source.start(0);

    const rendered = await ctx.startRendering();
    for (let channel = 0; channel < rendered.numberOfChannels; channel++) {
      const actual = rendered.getChannelData(channel);
      for (let i = 0; i < actual.length; i++) {
        const expected = Math.max(-1, Math.min(1, originals[channel][i]));
        // Allow one Float32 step for the shaper's linear interpolation.
        expect(Math.abs(actual[i] - expected)).toBeLessThanOrEqual(2 ** -23);
        expect(Math.abs(actual[i])).toBeLessThanOrEqual(1);
      }
    }
  });
});
