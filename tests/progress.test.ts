import { describe, it, expect, beforeEach } from "vitest";
import {
  loadProgress,
  setChosenGoals,
  skipGoalPicker,
  recordSessionCompleted,
  journeySteps,
  journeyPercent,
  recommendedPresetId,
  sessionsThisWeek,
  weeklyStreakDots,
  currentStreakDays,
  shouldShowReciprocity,
  dismissReciprocityCard,
  totalSessions,
} from "../src/state/progress";

function installLocalStorage() {
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
}

describe("progress: journey (goal gradient)", () => {
  beforeEach(installLocalStorage);

  it("auto-initializes discovery on first load and persists it", () => {
    const p = loadProgress();
    expect(p.discoveredAt).not.toBeNull();
    expect(localStorage.getItem("serenade.progress.v1")).toContain("discoveredAt");
  });

  it("journeyPercent is always >= 25, never 0", () => {
    expect(journeyPercent()).toBeGreaterThanOrEqual(25);
  });

  it("exposes the four step labels in order", () => {
    expect(journeySteps().map((s) => s.label)).toEqual([
      "Discovered Serenade",
      "Personalized your goals",
      "First session completed",
      "3 sessions completed",
    ]);
  });

  it("setChosenGoals completes step 2 and persists order", () => {
    setChosenGoals(["focus", "deep-sleep"]);
    expect(loadProgress().chosenGoals).toEqual(["focus", "deep-sleep"]);
    expect(loadProgress().goalPickerDone).toBe(true);
    expect(journeySteps()[1].done).toBe(true);
  });

  it("skipGoalPicker marks the picker seen WITHOUT completing step 2", () => {
    skipGoalPicker();
    expect(loadProgress().goalPickerDone).toBe(true);
    expect(journeySteps()[1].done).toBe(false);
  });

  it("1 session completes step 3, 3 sessions complete step 4, all four = 100%", () => {
    setChosenGoals(["focus"]);
    recordSessionCompleted("focus");
    expect(journeySteps()[2].done).toBe(true);
    expect(journeySteps()[3].done).toBe(false);
    recordSessionCompleted("focus");
    recordSessionCompleted("deep-sleep");
    expect(journeySteps()[3].done).toBe(true);
    expect(journeyPercent()).toBe(100);
  });
});

describe("progress: recommendedPresetId (smart defaults)", () => {
  beforeEach(installLocalStorage);

  it("maps each time-of-day window to its preset id", () => {
    expect(recommendedPresetId(new Date("2026-07-07T08:00"))).toBe("focus");
    expect(recommendedPresetId(new Date("2026-07-07T12:00"))).toBe("power-nap");
    expect(recommendedPresetId(new Date("2026-07-07T16:00"))).toBe("energy");
    expect(recommendedPresetId(new Date("2026-07-07T19:00"))).toBe("healing-relaxation");
    expect(recommendedPresetId(new Date("2026-07-07T22:00"))).toBe("deep-sleep");
    expect(recommendedPresetId(new Date("2026-07-07T03:00"))).toBe("deep-sleep");
  });

  it("handles window boundaries exactly", () => {
    expect(recommendedPresetId(new Date("2026-07-07T05:00"))).toBe("focus");
    expect(recommendedPresetId(new Date("2026-07-07T10:59"))).toBe("focus");
    expect(recommendedPresetId(new Date("2026-07-07T11:00"))).toBe("power-nap");
    expect(recommendedPresetId(new Date("2026-07-07T21:00"))).toBe("deep-sleep");
    expect(recommendedPresetId(new Date("2026-07-07T04:59"))).toBe("deep-sleep");
  });
});

describe("progress: weekly stats & streaks (loss aversion)", () => {
  beforeEach(installLocalStorage);

  // 2026-07-07 is a Tuesday; the Mon-Sun week is 2026-07-06 .. 2026-07-12.
  const NOW = new Date("2026-07-07T12:00");

  it("sessionsThisWeek counts only completions in the current Mon-Sun week", () => {
    recordSessionCompleted("focus", new Date("2026-07-01T10:00")); // previous week
    recordSessionCompleted("focus", new Date("2026-07-06T09:00")); // Monday
    recordSessionCompleted("deep-sleep", new Date("2026-07-07T08:00")); // Tuesday
    expect(sessionsThisWeek(NOW)).toBe(2);
  });

  it("weeklyStreakDots returns Monday-first boolean[7]", () => {
    recordSessionCompleted("focus", new Date("2026-07-06T09:00")); // Mon
    recordSessionCompleted("focus", new Date("2026-07-07T08:00")); // Tue
    recordSessionCompleted("focus", new Date("2026-07-12T08:00")); // Sun
    expect(weeklyStreakDots(NOW)).toEqual([true, true, false, false, false, false, true]);
  });

  it("currentStreakDays counts consecutive days ending today", () => {
    recordSessionCompleted("focus", new Date("2026-07-05T20:00"));
    recordSessionCompleted("focus", new Date("2026-07-06T20:00"));
    recordSessionCompleted("focus", new Date("2026-07-07T08:00"));
    expect(currentStreakDays(NOW)).toBe(3);
  });

  it("a streak ending yesterday still counts (morning visit before today's session)", () => {
    recordSessionCompleted("focus", new Date("2026-07-05T20:00"));
    recordSessionCompleted("focus", new Date("2026-07-06T20:00"));
    expect(currentStreakDays(new Date("2026-07-07T07:00"))).toBe(2);
  });

  it("a streak that ended two days ago is 0", () => {
    recordSessionCompleted("focus", new Date("2026-07-04T20:00"));
    expect(currentStreakDays(NOW)).toBe(0);
  });
});

describe("progress: reciprocity card", () => {
  beforeEach(installLocalStorage);

  it("is false at 0 and 1 completed sessions, true at 2+", () => {
    expect(shouldShowReciprocity()).toBe(false);
    recordSessionCompleted("focus");
    expect(shouldShowReciprocity()).toBe(false);
    recordSessionCompleted("focus");
    expect(shouldShowReciprocity()).toBe(true);
    expect(totalSessions()).toBe(2);
  });

  it("dismiss persists across loadProgress() calls", () => {
    recordSessionCompleted("focus");
    recordSessionCompleted("focus");
    dismissReciprocityCard();
    expect(shouldShowReciprocity()).toBe(false);
    loadProgress();
    expect(shouldShowReciprocity()).toBe(false);
  });
});

describe("progress: resilience", () => {
  beforeEach(installLocalStorage);

  it("corrupt localStorage JSON never throws — falls back to fresh defaults", () => {
    localStorage.setItem("serenade.progress.v1", "{not json");
    expect(() => loadProgress()).not.toThrow();
    expect(journeyPercent()).toBeGreaterThanOrEqual(25);
    expect(totalSessions()).toBe(0);
  });

  it("caps stored sessions at 400, dropping the oldest", () => {
    for (let i = 0; i < 405; i += 1) recordSessionCompleted(`s${i}`);
    const p = loadProgress();
    expect(p.completedSessions.length).toBe(400);
    expect(p.completedSessions[0].ref).toBe("s5");
    expect(totalSessions()).toBe(400);
  });
});
