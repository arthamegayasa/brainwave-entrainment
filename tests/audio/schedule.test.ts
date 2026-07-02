import { describe, it, expect } from "vitest";
import { buildSchedule, beatAt, phaseAt } from "../../src/audio/schedule";
import { PRESETS, getPreset } from "../../src/audio/presets";
import { SOLFEGGIO } from "../../src/audio/constants";

describe("buildSchedule (SCH-01)", () => {
  it("shapes ramp-in → hold → ramp-out for return presets", () => {
    const preset = getPreset("deep-meditation"); // 10 → 6, out to 10
    const schedule = buildSchedule(preset, 30 * 60);
    expect(schedule.points[0]).toEqual({ time: 0, hz: 10 });
    expect(schedule.points[1].hz).toBe(6);
    const last = schedule.points[schedule.points.length - 1];
    expect(last.time).toBe(30 * 60);
    expect(last.hz).toBe(10);
    expect(schedule.endSec).toBe(30 * 60);
  });

  it("sleep preset never ramps back up (SCH-02)", () => {
    const preset = getPreset("deep-sleep");
    const schedule = buildSchedule(preset, 45 * 60);
    const last = schedule.points[schedule.points.length - 1];
    expect(last.hz).toBe(preset.targetHz); // ends AT target, low
    // Frequencies never increase after the ramp-in.
    for (let i = 2; i < schedule.points.length; i++) {
      expect(schedule.points[i].hz).toBeLessThanOrEqual(schedule.points[i - 1].hz);
    }
  });

  it("caps ramp-in at 40% for short sessions", () => {
    const preset = getPreset("deep-sleep"); // rampInMin 20 > 40% of 15 min
    const schedule = buildSchedule(preset, 15 * 60);
    expect(schedule.points[1].time).toBe(15 * 60 * 0.4);
  });

  it("infinite sessions ramp in then hold forever (SCH-04 ∞)", () => {
    const preset = getPreset("focus");
    const schedule = buildSchedule(preset, null);
    expect(schedule.endSec).toBeNull();
    expect(schedule.points).toHaveLength(2);
    expect(beatAt(schedule, 10 * 60 * 60)).toBe(preset.targetHz);
  });
});

describe("beatAt / phaseAt", () => {
  it("interpolates linearly inside a ramp", () => {
    const preset = getPreset("deep-meditation");
    const schedule = buildSchedule(preset, 30 * 60);
    const rampEnd = schedule.points[1].time;
    const mid = beatAt(schedule, rampEnd / 2);
    expect(mid).toBeCloseTo((10 + 6) / 2, 5);
  });

  it("reports session phases", () => {
    const preset = getPreset("deep-meditation");
    const schedule = buildSchedule(preset, 30 * 60);
    expect(phaseAt(schedule, 10)).toBe("rampIn");
    expect(phaseAt(schedule, 15 * 60)).toBe("hold");
    expect(phaseAt(schedule, 30 * 60 - 60)).toBe("rampOut");
    expect(phaseAt(schedule, 30 * 60 + 1)).toBe("done");
  });
});

describe("PRESETS integrity (PRE-01, PRE-02)", () => {
  it("contains exactly the 8 goal presets", () => {
    expect(PRESETS.map((p) => p.id).sort()).toEqual(
      [
        "anxiety-relief",
        "creativity",
        "deep-meditation",
        "deep-sleep",
        "energy",
        "focus",
        "healing-relaxation",
        "power-nap",
      ],
    );
  });

  it("every carrier is a solfeggio frequency", () => {
    const solfeggioValues = Object.values(SOLFEGGIO) as number[];
    for (const preset of PRESETS) {
      expect(solfeggioValues, `${preset.id} carrier`).toContain(preset.carrierHz);
    }
  });

  it("every preset has positive frequencies and sane ramps", () => {
    for (const preset of PRESETS) {
      expect(preset.targetHz).toBeGreaterThan(0);
      expect(preset.startHz).toBeGreaterThan(0);
      expect(preset.rampInMin).toBeGreaterThan(0);
      if (preset.endHz === null) {
        // no closing ramp — nothing to check
      } else {
        expect(preset.rampOutMin).toBeGreaterThan(0);
      }
    }
  });

  it("power-nap wakes you up: ends higher than target", () => {
    const nap = getPreset("power-nap");
    expect(nap.endHz).not.toBeNull();
    expect(nap.endHz!).toBeGreaterThan(nap.targetHz);
  });
});
