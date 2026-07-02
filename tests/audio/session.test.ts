import { describe, it, expect } from "vitest";
import { OfflineAudioContext } from "node-web-audio-api";
import { SessionEngine } from "../../src/audio/session";
import { getPreset } from "../../src/audio/presets";
import type { Preset } from "../../src/audio/presets";
import { countZeroCrossings, maxAbs } from "./helpers";

/** A fast test preset: beat ramps 10 → 40 Hz over 0.8s within a 2s render. */
const FAST_PRESET: Preset = {
  ...getPreset("focus"),
  id: "test-fast",
  startHz: 10,
  targetHz: 40,
  endHz: null,
  rampInMin: 0.8 / 60 / 0.4, // rampIn capped at 40% → forces cap path aside
  rampOutMin: 0,
  carrierHz: 200,
};

describe("SessionEngine (SCH-01..04, PRE-03)", () => {
  it("binaural session ramps the beat on the audio clock", async () => {
    const ctx = new OfflineAudioContext(2, 88200, 44100); // 2 s
    const engine = new SessionEngine(ctx as unknown as BaseAudioContext);
    engine.start({
      preset: { ...FAST_PRESET, rampInMin: 1 / 60 }, // 1s ramp within 2s session
      durationMin: null, // infinite — no end fade interferes with measurement
      mode: "headphone",
      ambient: null,
    });
    const buffer = await ctx.startRendering();
    const right = buffer.getChannelData(1);

    // First 0.25s: beat near 10 → R ≈ 210 Hz. Last 0.5s: beat 40 → R ≈ 240 Hz.
    const head = right.slice(0, 11025);
    const tail = right.slice(66150);
    const headHz = countZeroCrossings(head) * 4;
    const tailHz = countZeroCrossings(tail) * 2;
    expect(headHz).toBeGreaterThan(200);
    expect(headHz).toBeLessThan(225);
    expect(tailHz).toBeGreaterThan(230);
    expect(tailHz).toBeLessThan(250);
  });

  it("speaker mode uses isochronic (identical L/R)", async () => {
    const ctx = new OfflineAudioContext(2, 44100, 44100);
    const engine = new SessionEngine(ctx as unknown as BaseAudioContext);
    engine.start({
      preset: FAST_PRESET,
      durationMin: null,
      mode: "speaker",
      ambient: null,
    });
    const buffer = await ctx.startRendering();
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    let maxDiff = 0;
    for (let i = 0; i < left.length; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(left[i] - right[i]));
    }
    expect(maxDiff).toBeLessThan(1e-6);
    expect(maxAbs(left)).toBeGreaterThan(0.01);
  });

  it("finite session auto-stops with fade — tail is silent (SCH-04)", async () => {
    const ctx = new OfflineAudioContext(2, 88200, 44100); // 2 s render
    const engine = new SessionEngine(ctx as unknown as BaseAudioContext);
    engine.start({
      preset: FAST_PRESET,
      durationMin: 1.5 / 60, // 1.5 second session
      mode: "headphone",
      ambient: "brown",
    });
    const buffer = await ctx.startRendering();
    const data = buffer.getChannelData(0);
    // After endTime (1.5s) + margin, output must be silent.
    const tail = data.slice(Math.floor(44100 * 1.8));
    expect(maxAbs(tail)).toBeLessThan(0.002);
  });

  it("ambient can be swapped live without stopping the session (UI-03)", async () => {
    const ctx = new OfflineAudioContext(2, 88200, 44100);
    const engine = new SessionEngine(ctx as unknown as BaseAudioContext);
    engine.start({
      preset: FAST_PRESET,
      durationMin: null,
      mode: "headphone",
      ambient: "brown",
    });
    engine.setAmbient("rain");
    engine.setAmbient(null);
    const buffer = await ctx.startRendering();
    expect(maxAbs(buffer.getChannelData(0))).toBeGreaterThan(0.01);
    expect(engine.getConfig()?.ambient).toBeNull();
  });

  it("per-channel volumes clamp to 0..1", () => {
    const ctx = new OfflineAudioContext(2, 44100, 44100);
    const engine = new SessionEngine(ctx as unknown as BaseAudioContext);
    engine.setVolume("master", 7);
    engine.setVolume("ambient", -3);
    expect(engine.getVolumes().master).toBe(1);
    expect(engine.getVolumes().ambient).toBe(0);
  });

  it("progress reports beat, phase, and remaining time", () => {
    const ctx = new OfflineAudioContext(2, 44100, 44100);
    const engine = new SessionEngine(ctx as unknown as BaseAudioContext);
    engine.start({
      preset: getPreset("deep-meditation"),
      durationMin: 30,
      mode: "headphone",
      ambient: null,
    });
    const p = engine.progress();
    expect(p.running).toBe(true);
    expect(p.currentBeatHz).toBeCloseTo(10, 1); // start of ramp
    expect(p.carrierHz).toBe(528);
    expect(p.phase).toBe("rampIn");
    expect(p.remainingSec).toBeCloseTo(30 * 60, 0);
  });
});
