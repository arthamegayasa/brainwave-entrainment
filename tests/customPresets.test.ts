import { describe, expect, it } from "vitest";
import { sanitizeSession } from "../src/state/customPresets";

/**
 * sanitizeSession is the trust boundary for imported .serenade.json files and
 * cloud jsonb specs (quick-260707-a47 review findings): it must bound the
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

const validCurve = {
  startHz: 10,
  targetHz: 6,
  endHz: 10,
  rampInMin: 5,
  rampOutMin: 2,
};

const spec = (layers: unknown[]) => ({
  version: 1,
  id: "custom-test",
  name: "Test Session",
  curve: validCurve,
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
