import { describe, it, expect, beforeEach } from "vitest";
import { OfflineAudioContext } from "node-web-audio-api";
import { BuilderEngine } from "../../src/audio/builder";
import type { BuilderCurve, BuilderLayerSpec, CustomSession } from "../../src/audio/builder";
import { findRelated } from "../../src/audio/freqfinder";
import {
  listCustomSessions,
  saveCustomSession,
  deleteCustomSession,
  exportSessionJSON,
  importSessionJSON,
} from "../../src/state/customPresets";
import { countZeroCrossings, maxAbs } from "./helpers";

const CURVE: BuilderCurve = {
  startHz: 10,
  targetHz: 40,
  endHz: null,
  rampInMin: 1 / 60, // 1 second
  rampOutMin: 0,
};

function layer(partial: Partial<BuilderLayerSpec>): BuilderLayerSpec {
  return {
    id: partial.id ?? `l-${Math.random().toString(36).slice(2, 8)}`,
    type: "binaural",
    carrierHz: 200,
    beatMode: "follow",
    fixedBeatHz: 10,
    gain: 0.8,
    ...partial,
  };
}

describe("BuilderEngine (BLD-01, BLD-03)", () => {
  it("plays multiple layers simultaneously with per-layer methods", async () => {
    const ctx = new OfflineAudioContext(2, 88200, 44100);
    const engine = new BuilderEngine(ctx as unknown as BaseAudioContext);
    engine.start(
      [
        layer({ id: "a", type: "binaural", carrierHz: 200 }),
        layer({ id: "b", type: "pure", carrierHz: 528, gain: 0.4 }),
        layer({ id: "c", type: "brown", gain: 0.3 }),
      ],
      CURVE,
      null,
    );
    const buffer = await ctx.startRendering();
    expect(maxAbs(buffer.getChannelData(0))).toBeGreaterThan(0.05);
    expect(maxAbs(buffer.getChannelData(0))).toBeLessThanOrEqual(1.0);
  });

  it("follow layers ride the custom curve (beat ramps 10 → 40)", async () => {
    const ctx = new OfflineAudioContext(2, 88200, 44100); // 2 s
    const engine = new BuilderEngine(ctx as unknown as BaseAudioContext);
    engine.start([layer({ id: "a", type: "binaural", carrierHz: 200 })], CURVE, null);
    const buffer = await ctx.startRendering();
    const right = buffer.getChannelData(1);
    const head = right.slice(0, 11025); // first 0.25 s → beat ≈ 10-ish
    const tail = right.slice(66150); // last 0.5 s → beat = 40
    const headHz = countZeroCrossings(head) * 4;
    const tailHz = countZeroCrossings(tail) * 2;
    expect(headHz).toBeLessThan(225);
    expect(tailHz).toBeGreaterThan(230);
  });

  it("finite custom sessions auto-stop silent", async () => {
    const ctx = new OfflineAudioContext(2, 88200, 44100);
    const engine = new BuilderEngine(ctx as unknown as BaseAudioContext);
    engine.start(
      [layer({ id: "a", type: "isochronic", carrierHz: 528 })],
      CURVE,
      1.5 / 60,
    );
    const buffer = await ctx.startRendering();
    const tail = buffer.getChannelData(0).slice(Math.floor(44100 * 1.8));
    expect(maxAbs(tail)).toBeLessThan(0.002);
  });
});

describe("findRelated (BLD-02)", () => {
  it("suggests octaves, fifth, and harmonics for 200 Hz", () => {
    const suggestions = findRelated(200);
    const hzList = suggestions.map((s) => s.hz);
    expect(hzList).toContain(400); // octave up
    expect(hzList).toContain(100); // octave down
    expect(hzList).toContain(300); // perfect fifth
    expect(hzList).toContain(600); // 3rd harmonic
  });

  it("includes nearest solfeggio and sorts by correlation", () => {
    const suggestions = findRelated(500);
    expect(suggestions.some((s) => s.relation === "Solfeggio terdekat")).toBe(true);
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i].correlation).toBeLessThanOrEqual(
        suggestions[i - 1].correlation,
      );
    }
  });

  it("returns empty for invalid input and bounds the range", () => {
    expect(findRelated(0)).toEqual([]);
    expect(findRelated(NaN)).toEqual([]);
    for (const s of findRelated(963)) {
      expect(s.hz).toBeGreaterThanOrEqual(20);
      expect(s.hz).toBeLessThanOrEqual(1500);
    }
  });
});

describe("custom preset storage (BLD-04)", () => {
  // Minimal in-memory localStorage for the node test environment.
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => void store.clear(),
      key: () => null,
      get length() {
        return store.size;
      },
    };
  });

  const SESSION: CustomSession = {
    version: 1,
    id: "test-1",
    name: "Sesi Uji",
    curve: { startHz: 10, targetHz: 6, endHz: 10, rampInMin: 10, rampOutMin: 5 },
    layers: [
      {
        id: "l1",
        type: "binaural",
        carrierHz: 528,
        beatMode: "follow",
        fixedBeatHz: 6,
        gain: 0.8,
      },
    ],
    createdAt: "2026-07-02T00:00:00.000Z",
  };

  it("save → list → delete round-trip", () => {
    saveCustomSession(SESSION);
    expect(listCustomSessions()).toHaveLength(1);
    expect(listCustomSessions()[0].name).toBe("Sesi Uji");
    deleteCustomSession("test-1");
    expect(listCustomSessions()).toHaveLength(0);
  });

  it("export → import round-trip preserves the session", () => {
    const json = exportSessionJSON(SESSION);
    const imported = importSessionJSON(json);
    expect(imported.name).toBe(SESSION.name);
    expect(imported.curve).toEqual(SESSION.curve);
    expect(imported.layers).toHaveLength(1);
    expect(imported.layers[0].carrierHz).toBe(528);
  });

  it("import clamps hostile values and rejects garbage", () => {
    const hostile = JSON.stringify({
      name: "x".repeat(500),
      curve: { startHz: 99999, targetHz: -5, endHz: null, rampInMin: 1e9, rampOutMin: 0 },
      layers: [
        { type: "binaural", carrierHz: 1e9, beatMode: "fixed", fixedBeatHz: -1, gain: 42 },
      ],
    });
    const imported = importSessionJSON(hostile);
    expect(imported.name.length).toBeLessThanOrEqual(60);
    expect(imported.curve.startHz).toBeLessThanOrEqual(50);
    expect(imported.layers[0].carrierHz).toBeLessThanOrEqual(1500);
    expect(imported.layers[0].gain).toBeLessThanOrEqual(1);

    expect(() => importSessionJSON("not json")).toThrow();
    expect(() => importSessionJSON('{"layers": []}')).toThrow();
  });
});
