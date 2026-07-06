import { describe, it, expect, beforeEach } from "vitest";
import { loadPrefs, savePrefs } from "../src/state/prefs";
import { getTier, setTier, features, isUnlocked, ALL_UNLOCKED, PRICING } from "../src/state/tier";
import { getPreset } from "../src/audio/presets";

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

describe("prefs persistence (PWA-03)", () => {
  beforeEach(installLocalStorage);

  it("returns defaults when empty", () => {
    const p = loadPrefs();
    expect(p.lastMode).toBe("headphone");
    expect(p.lastDurationMin).toBe(30);
    expect(p.volumes).toEqual({});
  });

  it("persists and merges patches", () => {
    savePrefs({ lastPresetId: "focus" });
    savePrefs({ volumes: { master: 0.5 } });
    const p = loadPrefs();
    expect(p.lastPresetId).toBe("focus");
    expect(p.volumes.master).toBe(0.5);
  });

  it("survives corrupt storage", () => {
    localStorage.setItem("serenade.prefs.v1", "{not json");
    expect(loadPrefs().lastMode).toBe("headphone");
  });
});

describe("tier scaffold (MON-01)", () => {
  beforeEach(installLocalStorage);

  it("ships fully unlocked in this build", () => {
    expect(ALL_UNLOCKED).toBe(true);
    expect(isUnlocked("studio")).toBe(true);
    expect(isUnlocked("premiumPresets")).toBe(true);
    expect(isUnlocked("infiniteDuration")).toBe(true);
  });

  it("stores and reads tier", () => {
    expect(getTier()).toBe("free");
    setTier("premium");
    expect(getTier()).toBe("premium");
  });

  it("features() returns full set when unlocked", () => {
    expect(features().studio).toBe(true);
  });
});

describe("pricing (MON-01)", () => {
  it("annual is cheaper per year than 12 months and advertises the right saving", () => {
    const { monthly, annual } = PRICING.IDR;
    expect(annual.amount).toBeLessThan(monthly.amount * 12);
    const actualSave = Math.round((1 - annual.amount / (monthly.amount * 12)) * 100);
    expect(annual.savePercent).toBe(58);
    expect(actualSave).toBe(annual.savePercent);
  });

  it("anchor annual is exactly 12 x monthly (contrast anchor, never charged)", () => {
    expect(PRICING.IDR.anchorAnnual.amount).toBe(PRICING.IDR.monthly.amount * 12);
  });
});

describe("goal-first preset names (quick-260707-a47)", () => {
  it("renames presets while keeping ids unchanged", () => {
    expect(getPreset("deep-sleep").name).toBe("Sleeping");
    expect(getPreset("deep-meditation").name).toBe("Meditating");
    expect(getPreset("healing-relaxation").name).toBe("Relaxing");
    expect(getPreset("anxiety-relief").name).toBe("Calming Anxiety");
    expect(getPreset("focus").name).toBe("Focus & Concentration");
    expect(getPreset("energy").name).toBe("Boosting Energy");
    expect(getPreset("creativity").name).toBe("Creative Flow");
    expect(getPreset("power-nap").name).toBe("Power Nap");
  });
});
