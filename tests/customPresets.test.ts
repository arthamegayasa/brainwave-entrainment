import { describe, expect, it } from "vitest";
import {
  exportSessionJSON,
  importSessionJSON,
  sanitizeSession,
} from "../src/state/customPresets";
import { sceneOf } from "../src/ui/scenes";

/**
 * sanitizeSession is the trust boundary for imported .swarasanti.json files and
 * cloud jsonb specs (review findings): it must bound the
 * layer count and guarantee unique layer ids before a spec can reach
 * BuilderEngine.
 */

const validLayer = (id: string) => ({
  id,
  type: "binaural",
  carrierHz: 200,
  beatMode: "follow",
  fixedBeatHz: 10,
  gain: 0.5,
});

const validJourney = {
  startHz: 10,
  points: [
    { hz: 6, minutes: 5, easing: "ease-in-out" },
    { hz: 10, minutes: 2, easing: "wave", swings: 4 },
  ],
  holdAt: 0,
};

const spec = (layers: unknown[]) => ({
  version: 2,
  id: "custom-test",
  name: "Test Session",
  journey: validJourney,
  layers,
  createdAt: "2026-07-07T00:00:00.000Z",
});

describe("sanitizeSession layer cap", () => {
  it("caps a hostile spec's layer count at 12", () => {
    const layers = Array.from({ length: 5000 }, (_, i) => validLayer(`l${i}`));
    const result = sanitizeSession(spec(layers));
    expect(result).not.toBeNull();
    expect(result!.layers.length).toBe(12);
  });

  it("keeps all layers of a normal-sized session", () => {
    const layers = Array.from({ length: 4 }, (_, i) => validLayer(`l${i}`));
    const result = sanitizeSession(spec(layers));
    expect(result!.layers.length).toBe(4);
  });
});

describe("sanitizeSession Journey", () => {
  const withJourney = (journey: unknown) => sanitizeSession({ ...spec([validLayer("a")]), journey });

  it("keeps a valid Journey as designed", () => {
    expect(withJourney(validJourney)!.journey).toEqual(validJourney);
  });

  it("caps a hostile Journey at 12 points and keeps its Hold on one of them", () => {
    const points = Array.from({ length: 500 }, () => ({ hz: 8, minutes: 1, easing: "linear" }));
    const journey = withJourney({ startHz: 10, points, holdAt: 400 })!.journey;
    expect(journey.points).toHaveLength(12);
    expect(journey.holdAt).toBe(11);
  });

  it("reads an unknown curve as linear and a missing Hold as the last point", () => {
    const journey = withJourney({ startHz: 10, points: [{ hz: 6, minutes: 5, easing: "wobble" }, { hz: 4, minutes: 5 }] })!.journey;
    expect(journey.points.map((p) => p.easing)).toEqual(["linear", "linear"]);
    expect(journey.holdAt).toBe(1);
  });

  it("rejects a spec whose Journey has no point", () => {
    expect(withJourney({ startHz: 10, points: [], holdAt: 0 })).toBeNull();
  });

  it("plays the retired Fast → slow and Slow → fast as Proportional", () => {
    const journey = withJourney({
      startHz: 10,
      points: [
        { hz: 6, minutes: 5, easing: "ease-out" },
        { hz: 10, minutes: 5, easing: "ease-in" },
      ],
      holdAt: 0,
    })!.journey;
    expect(journey.points.map((p) => p.easing)).toEqual(["exponential", "exponential"]);
  });

  it("gives a wave 2–8 whole swings (3 when missing) and no other curve any", () => {
    const points = [
      { hz: 8, minutes: 6, easing: "wave", swings: 40 },
      { hz: 10, minutes: 6, easing: "wave", swings: 0 },
      { hz: 8, minutes: 6, easing: "wave", swings: 4.6 },
      { hz: 10, minutes: 6, easing: "wave" },
      { hz: 8, minutes: 6, easing: "linear", swings: 5 },
    ];
    const journey = withJourney({ startHz: 10, points, holdAt: 0 })!.journey;
    expect(journey.points.map((p) => p.swings)).toEqual([8, 2, 5, 3, undefined]);
    expect(journey.points[4]).not.toHaveProperty("swings");
  });

  // Saved sessions, Audio Bank specs, and exported files from before the Journey.
  describe("a version 1 curve", () => {
    const v1 = (curve: unknown) => {
      const { journey: _journey, ...rest } = spec([validLayer("a")]);
      return sanitizeSession({ ...rest, version: 1, curve })!;
    };

    it("plays Target from the start and held, then End as the closing", () => {
      const session = v1({ startHz: 10, targetHz: 6, endHz: 10, rampInMin: 10, rampOutMin: 5 });
      expect(session.version).toBe(2);
      expect(session.journey).toEqual({
        startHz: 10,
        points: [
          { hz: 6, minutes: 10, easing: "linear" },
          { hz: 10, minutes: 5, easing: "linear" },
        ],
        holdAt: 0,
      });
    });

    it("holds Target to the end without an End or its ramp", () => {
      for (const [endHz, rampOutMin] of [[null, 0], [10, 0]]) {
        const session = v1({ startHz: 10, targetHz: 2, endHz, rampInMin: 20, rampOutMin });
        expect(session.journey).toEqual({
          startHz: 10,
          points: [{ hz: 2, minutes: 20, easing: "linear" }],
          holdAt: 0,
        });
      }
    });
  });
});

describe("sanitizeSession duplicate layer ids", () => {
  it("regenerates colliding ids so every layer id is unique", () => {
    const result = sanitizeSession(
      spec([validLayer("a"), validLayer("a"), validLayer("a")]),
    );
    expect(result).not.toBeNull();
    const ids = result!.layers.map((l) => l.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toBe("a"); // the first occurrence keeps its id
  });

  it("leaves already-unique ids untouched", () => {
    const result = sanitizeSession(spec([validLayer("a"), validLayer("b")]));
    expect(result!.layers.map((l) => l.id)).toEqual(["a", "b"]);
  });
});

describe("sanitizeSession Scene", () => {
  /** Brainwave Ribbons, the Scene of Custom Audio whose designer chose none. */
  const DEFAULT = "brainwave-ribbons";

  it("keeps a pickable Scene id, even Misty Peak, the default before Brainwave Ribbons", () => {
    const result = sanitizeSession({ ...spec([validLayer("a")]), sceneId: "deep-meditation" });
    expect(sceneOf(result!)).toBe("deep-meditation");
  });

  it("shows the default Scene for a spec without one, or with an unknown or unpickable one", () => {
    for (const sceneId of [undefined, null, 7, "", "no-such-scene", "landing", "complete"]) {
      const result = sanitizeSession({ ...spec([validLayer("a")]), sceneId });
      expect(sceneOf(result!)).toBe(DEFAULT);
    }
  });

  it("keeps the Scene through export and import", () => {
    const session = sanitizeSession({ ...spec([validLayer("a")]), sceneId: "creativity" })!;
    expect(sceneOf(importSessionJSON(exportSessionJSON(session)))).toBe("creativity");
  });

  // Absent means "the default, whichever it is": a spec without a choice must
  // not come back with today's default written in, or it would never follow
  // a new default.
  it("stores no Scene for a spec without a choice, through export and import", () => {
    for (const sceneId of [undefined, "no-such-scene"]) {
      const session = sanitizeSession({ ...spec([validLayer("a")]), sceneId })!;
      const exported = exportSessionJSON(importSessionJSON(exportSessionJSON(session)));
      expect(JSON.parse(exported)).not.toHaveProperty("sceneId");
    }
  });
});
