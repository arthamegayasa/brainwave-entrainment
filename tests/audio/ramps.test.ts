import { describe, it, expect } from "vitest";
import { OfflineAudioContext } from "node-web-audio-api";
import { fadeIn, fadeOut } from "../../src/audio/ramps";
import { maxDelta } from "./helpers";

describe("ramps discipline (ENG-06)", () => {
  it("fadeIn + fadeOut renders click-free and ends silent", async () => {
    const ctx = new OfflineAudioContext(1, 44100, 44100);
    const osc = ctx.createOscillator();
    osc.frequency.value = 440;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(ctx.destination);
    fadeIn(gain.gain, 0.5, 0);
    fadeOut(gain.gain, 0.5);
    osc.start(0);
    const buffer = await ctx.startRendering();
    const data = buffer.getChannelData(0);

    // Natural 440 Hz sine delta at A=0.5 is ~0.031; a gain step discontinuity is >> 0.1.
    expect(maxDelta(data)).toBeLessThan(0.1);

    // Fully silent after fade-out completes.
    const tail = data.slice(data.length - 100);
    for (const sample of tail) expect(Math.abs(sample)).toBeLessThan(0.001);
  });

  it("fadeOut anchors current value — no jump at the fade point", async () => {
    const ctx = new OfflineAudioContext(1, 44100, 44100);
    const osc = ctx.createOscillator();
    osc.frequency.value = 440;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(ctx.destination);
    fadeIn(gain.gain, 0.5, 0);
    fadeOut(gain.gain, 0.5);
    osc.start(0);
    const buffer = await ctx.startRendering();
    const data = buffer.getChannelData(0);

    // Inspect a window around t=0.5s for discontinuities (Pitfall 3).
    const start = Math.floor(0.5 * 44100) - 100;
    const window = data.slice(start, start + 4600);
    expect(maxDelta(window)).toBeLessThan(0.1);
  });

  it("fadeOut does not throw (no exponential ramp to zero)", () => {
    const ctx = new OfflineAudioContext(1, 44100, 44100);
    const gain = ctx.createGain();
    gain.gain.value = 0.8;
    expect(() => fadeOut(gain.gain, 0.1)).not.toThrow();
  });
});
