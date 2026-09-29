import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { OfflineAudioContext } from "node-web-audio-api";
import { BuilderEngine, journeySchedule, retimePoint, sessionBeat } from "../../src/audio/builder";
import type { BuilderLayerSpec, CustomSession, Journey } from "../../src/audio/builder";
import { beatAt, beatPath, phaseAt } from "../../src/audio/schedule";
import type { Easing } from "../../src/audio/schedule";
import { findRelated } from "../../src/audio/freqfinder";
import {
  listCustomSessions,
  saveCustomSession,
  deleteCustomSession,
  exportSessionJSON,
  importSessionJSON,
} from "../../src/state/customPresets";
import { countZeroCrossings, maxAbs, seededRandom } from "./helpers";

const JOURNEY: Journey = {
  startHz: 10,
  points: [{ hz: 40, minutes: 1 / 60, easing: "linear" }], // 1 second
  holdAt: 0,
};

/** A meditation's shape: down to 6 Hz in 10 min and held, back to 10 Hz over the last 5. */
const MEDITATION: Journey = {
  startHz: 10,
  points: [
    { hz: 6, minutes: 10, easing: "linear" },
    { hz: 10, minutes: 5, easing: "linear" },
  ],
  holdAt: 0,
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

describe("BuilderEngine", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([1, 2])("keeps mixed layers within full scale on both channels (noise seed %i)", async (seed) => {
    vi.spyOn(Math, "random").mockImplementation(seededRandom(seed));
    const ctx = new OfflineAudioContext(2, 88200, 44100);
    const engine = new BuilderEngine(ctx as unknown as BaseAudioContext);
    engine.start(
      [
        layer({ id: "a", type: "binaural", carrierHz: 200 }),
        layer({ id: "b", type: "pure", carrierHz: 528, gain: 0.4 }),
        layer({ id: "c", type: "brown", gain: 0.3 }),
      ],
      JOURNEY,
      null,
    );
    const buffer = await ctx.startRendering();
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      expect(maxAbs(buffer.getChannelData(channel))).toBeGreaterThan(0.05);
      expect(maxAbs(buffer.getChannelData(channel))).toBeLessThanOrEqual(1.0);
    }
  });

  it("follow layers ride the custom Journey (beat ramps 10 → 40)", async () => {
    const ctx = new OfflineAudioContext(2, 88200, 44100); // 2 s
    const engine = new BuilderEngine(ctx as unknown as BaseAudioContext);
    engine.start([layer({ id: "a", type: "binaural", carrierHz: 200 })], JOURNEY, null);
    const buffer = await ctx.startRendering();
    const right = buffer.getChannelData(1);
    const head = right.slice(0, 11025); // first 0.25 s → beat ≈ 10-ish
    const tail = right.slice(66150); // last 0.5 s → beat = 40
    const headHz = countZeroCrossings(head) * 4;
    const tailHz = countZeroCrossings(tail) * 2;
    expect(headHz).toBeLessThan(225);
    expect(tailHz).toBeGreaterThan(230);
  });

  // 10 → 40 Hz, heard over 1.6–2.4 s; the right ear plays 200 Hz above the Beat.
  // Over 4 s the window is u 0.4–0.6: a mean of 25 Hz straight, 20.06 Hz at a
  // constant ratio. Over 10 s with 3 swings it straddles the first arrival at
  // 40 Hz: 38.92 Hz (a straight move would be at 16 Hz).
  it.each([
    ["linear", 4, 225],
    ["exponential", 4, 220.06],
    ["wave", 10, 238.92],
  ] as Array<[Easing, number, number]>)("a %s move plays its own curve", async (easing, moveSec, meanRightHz) => {
    const ctx = new OfflineAudioContext(2, 44100 * (moveSec + 1), 44100);
    const engine = new BuilderEngine(ctx as unknown as BaseAudioContext);
    engine.start(
      [layer({ id: "a", type: "binaural", carrierHz: 200 })],
      { startHz: 10, points: [{ hz: 40, minutes: moveSec / 60, easing, swings: 3 }], holdAt: 0 },
      null,
    );
    const buffer = await ctx.startRendering();
    const window = buffer.getChannelData(1).slice(44100 * 1.6, 44100 * 2.4);
    expect(countZeroCrossings(window) / 0.8).toBeCloseTo(meanRightHz, -0.5);
  });

  it("finite custom sessions auto-stop silent", async () => {
    const ctx = new OfflineAudioContext(2, 88200, 44100);
    const engine = new BuilderEngine(ctx as unknown as BaseAudioContext);
    engine.start(
      [layer({ id: "a", type: "isochronic", carrierHz: 528 })],
      JOURNEY,
      1.5 / 60,
    );
    const buffer = await ctx.startRendering();
    const tail = buffer.getChannelData(0).slice(Math.floor(44100 * 1.8));
    expect(maxAbs(tail)).toBeLessThan(0.002);
  });
});

describe("journeySchedule", () => {
  const shape = (journey: Journey, durationMin: number | null) =>
    journeySchedule(journey, durationMin === null ? null : durationMin * 60).points.map((p) => [p.time / 60, p.hz]);

  it("times points up to the Hold from the start and the rest from the end; the Hold fills between", () => {
    expect(shape(MEDITATION, 30)).toEqual([[0, 10], [10, 6], [25, 6], [30, 10]]);
    expect(shape(MEDITATION, 60)).toEqual([[0, 10], [10, 6], [55, 6], [60, 10]]);
  });

  it("holds the last point to the end when the Hold is there", () => {
    const descent: Journey = {
      startHz: 10,
      points: [
        { hz: 8, minutes: 5, easing: "linear" },
        { hz: 4, minutes: 5, easing: "linear" },
      ],
      holdAt: 1,
    };
    expect(shape(descent, 30)).toEqual([[0, 10], [5, 8], [10, 4], [30, 4]]);
  });

  it("runs every move faster in a Play shorter than the moves, so the closing still ends it", () => {
    // 15 min of moves in 12 min: each move at 80% of its time, no Hold.
    expect(shape(MEDITATION, 12)).toEqual([[0, 10], [8, 6], [8, 6], [12, 10]]);
  });

  it("lets a move take a whole Play", () => {
    const whole: Journey = { startHz: 10, points: [{ hz: 2, minutes: 60, easing: "linear" }], holdAt: 0 };
    expect(shape(whole, 60)).toEqual([[0, 10], [60, 2], [60, 2]]);
  });

  it("plays an endless session up to the Hold and holds there, never closing", () => {
    const schedule = journeySchedule(MEDITATION, null);
    expect(schedule.points.map((p) => [p.time / 60, p.hz])).toEqual([[0, 10], [10, 6]]);
    expect(schedule.endSec).toBeNull();
    expect(beatAt(schedule, 5 * 3600)).toBe(6);
  });

  it("names the phases around the Hold: moving to it, holding, closing", () => {
    const schedule = journeySchedule(MEDITATION, 30 * 60);
    expect(phaseAt(schedule, 5 * 60)).toBe("rampIn");
    expect(phaseAt(schedule, 20 * 60)).toBe("hold");
    expect(phaseAt(schedule, 28 * 60)).toBe("rampOut");
    expect(phaseAt(schedule, 30 * 60)).toBe("done");
  });

  it("eases each move by its curve, meeting a straight move at both ends", () => {
    const at = (easing: Easing, min: number) =>
      beatAt(
        journeySchedule({ startHz: 10, points: [{ hz: 6, minutes: 10, easing, swings: 3 }], holdAt: 0 }, 1800),
        min * 60,
      );
    expect(at("linear", 5)).toBeCloseTo(8);
    expect(at("ease-in-out", 5)).toBeCloseTo(8);
    expect(at("ease-in-out", 2)).toBeGreaterThan(at("linear", 2)); // leaves 10 Hz gently
    expect(at("exponential", 5)).toBeCloseTo(Math.sqrt(10 * 6)); // the same ratio each half
    // 3 swings: 5 passes of 2 min, 10 → 6 → 10 → 6 → 10 → 6.
    expect([2, 3, 4, 6, 8].map((min) => at("wave", min))).toEqual([6, 8, 10, 6, 10]);
    for (const easing of ["linear", "ease-in-out", "exponential", "wave"] as Easing[]) {
      expect(at(easing, 0)).toBe(10);
      expect(at(easing, 10)).toBe(6);
    }
  });
});

describe("retimePoint (dragging a point along the chart)", () => {
  /** 10 → 8 in 5 min → 6 in 5 min, held; then 9 in 4 min and 10 in 2 min closing a Play. */
  const JOURNEY: Journey = {
    startHz: 10,
    points: [
      { hz: 8, minutes: 5, easing: "linear" },
      { hz: 6, minutes: 5, easing: "linear" },
      { hz: 9, minutes: 4, easing: "linear" },
      { hz: 10, minutes: 2, easing: "linear" },
    ],
    holdAt: 1,
  };
  const arrivals = (journey: Journey, durationMin: number) =>
    journeySchedule(journey, durationMin * 60).points.map((p) => p.time / 60);
  const minutesOf = (journey: Journey) => journey.points.map((p) => p.minutes);

  it("moves a point before the Hold while the point after it stays put", () => {
    const moved = retimePoint(JOURNEY, 0, 7 * 60, 30 * 60);
    expect(minutesOf(moved)).toEqual([7, 3, 4, 2]);
    expect(arrivals(moved, 30)).toEqual([0, 7, 10, 24, 28, 30]);
  });

  it("lets the Hold point's move grow into the Hold, never past its end", () => {
    expect(minutesOf(retimePoint(JOURNEY, 1, 20 * 60, 30 * 60))).toEqual([5, 15, 4, 2]);
    // The Hold runs 10–24 min: its point cannot pass 24.
    expect(minutesOf(retimePoint(JOURNEY, 1, 29 * 60, 30 * 60))).toEqual([5, 19, 4, 2]);
  });

  it("moves a closing point between its neighbours, keeping the Hold's end", () => {
    const moved = retimePoint(JOURNEY, 2, 27 * 60, 30 * 60);
    expect(minutesOf(moved)).toEqual([5, 5, 3, 3]);
    expect(arrivals(moved, 30)).toEqual([0, 5, 10, 24, 27, 30]);
  });

  it("keeps a closing's last point on the end", () => {
    expect(retimePoint(JOURNEY, 3, 20 * 60, 30 * 60)).toBe(JOURNEY);
  });

  it("snaps to half minutes and leaves every move at least half a minute", () => {
    expect(minutesOf(retimePoint(JOURNEY, 0, 6.2 * 60, 30 * 60))).toEqual([6, 4, 4, 2]);
    expect(minutesOf(retimePoint(JOURNEY, 0, 60 * 60, 30 * 60))).toEqual([9.5, 0.5, 4, 2]);
    expect(minutesOf(retimePoint(JOURNEY, 0, -60, 30 * 60))).toEqual([0.5, 9.5, 4, 2]);
  });

  it("follows the pointer in a Play that runs the moves faster", () => {
    // 16 min of moves in 8 min: half speed on the chart, so 3.5 chart minutes are 7 designed ones.
    const moved = retimePoint(JOURNEY, 0, 3.5 * 60, 8 * 60);
    expect(minutesOf(moved)).toEqual([7, 3, 4, 2]);
    expect(arrivals(moved, 8)[1]).toBe(3.5);
  });
});

describe("beatPath", () => {
  const eased: Journey = {
    startHz: 10,
    points: [
      { hz: 4, minutes: 10, easing: "ease-in-out" },
      { hz: 12, minutes: 5, easing: "wave", swings: 4 },
    ],
    holdAt: 0,
  };

  it("draws eased moves in straight pieces that stay on the curve", () => {
    const schedule = journeySchedule(eased, 30 * 60);
    const path = beatPath(schedule);
    const linearAt = (t: number) => beatAt({ points: path, endSec: 1800, holdIndex: 0 }, t);
    for (let t = 0; t <= 1800; t += 7) {
      expect(Math.abs(linearAt(t) - beatAt(schedule, t))).toBeLessThan(0.01);
    }
  });

  it("opens a late joiner at the Beat the session is on, not at the Start", () => {
    const schedule = journeySchedule(eased, 30 * 60);
    const path = beatPath(schedule, 4 * 60);
    expect(path[0]).toEqual({ time: 0, hz: beatAt(schedule, 4 * 60) });
    expect(path.every((p, i) => i === 0 || p.time > path[i - 1].time)).toBe(true);
    expect(path[path.length - 1]).toEqual({ time: 26 * 60, hz: 12 });
  });
});

describe("sessionBeat", () => {
  const schedule = journeySchedule(MEDITATION, 30 * 60);

  it("is the Journey while the main Beat follows it", () => {
    expect(sessionBeat([layer({ type: "rain" }), layer({ beatMode: "follow" })], schedule)).toBe(schedule);
  });

  it("stays on the main layer's fixed Beat, even when a later layer follows", () => {
    const beat = sessionBeat([layer({ beatMode: "fixed", fixedBeatHz: 7.83 }), layer({ beatMode: "follow" })], schedule);
    expect(beatAt(beat, 0)).toBe(7.83);
    expect(beatAt(beat, 20 * 60)).toBe(7.83);
    expect(phaseAt(beat, 20 * 60)).toBe("hold");
    expect(beat.endSec).toBe(30 * 60);
  });
});

describe("findRelated", () => {
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
    expect(suggestions.some((s) => s.relation === "Nearest solfeggio")).toBe(true);
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

describe("custom preset storage", () => {
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
    version: 2,
    id: "test-1",
    name: "Sesi Uji",
    journey: MEDITATION,
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
    expect(imported.journey).toEqual(SESSION.journey);
    expect(imported.layers).toHaveLength(1);
    expect(imported.layers[0].carrierHz).toBe(528);
  });

  it("import clamps hostile values and rejects garbage", () => {
    const hostile = JSON.stringify({
      name: "x".repeat(500),
      journey: {
        startHz: 99999,
        points: [{ hz: -5, minutes: 1e9, easing: "wobble" }],
        holdAt: 99,
      },
      layers: [
        { type: "binaural", carrierHz: 1e9, beatMode: "fixed", fixedBeatHz: -1, gain: 42 },
      ],
    });
    const imported = importSessionJSON(hostile);
    expect(imported.name.length).toBeLessThanOrEqual(60);
    expect(imported.journey).toEqual({
      startHz: 50,
      points: [{ hz: 0.5, minutes: 60, easing: "linear" }],
      holdAt: 0,
    });
    expect(imported.layers[0].carrierHz).toBeLessThanOrEqual(1500);
    expect(imported.layers[0].gain).toBeLessThanOrEqual(1);

    expect(() => importSessionJSON("not json")).toThrow();
    expect(() => importSessionJSON('{"layers": []}')).toThrow();
  });
});
