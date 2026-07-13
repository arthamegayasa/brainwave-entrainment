import { describe, it, expect, beforeEach } from "vitest";
import { ALL_UNLOCKED, PRICING, features } from "../src/state/tier";

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

describe("clinician pricing invariants (quick-260714-a8a)", () => {
  const clinician = PRICING.IDR.clinician;

  it("charges Rp249k monthly and Rp1.99M annually", () => {
    expect(clinician.monthly.amount).toBe(249000);
    expect(clinician.annual.amount).toBe(1990000);
  });

  it("anchors annual at exactly 12 x clinician monthly (contrast only, never charged)", () => {
    expect(clinician.annual.anchor.amount).toBe(clinician.monthly.amount * 12);
    expect(clinician.annual.anchor.amount).toBe(2988000);
  });

  it("advertises the true save percent vs the anchor", () => {
    const actualSave = Math.round(
      (1 - clinician.annual.amount / clinician.annual.anchor.amount) * 100,
    );
    expect(actualSave).toBe(33);
    expect(clinician.annual.savePercent).toBe(33);
  });

  it("shows the true per-month equivalent for annual billing", () => {
    expect(Math.round(clinician.annual.amount / 12)).toBe(165833);
    expect(clinician.annual.perMonth).toBe("Rp165,833");
  });
});

describe("premium pricing untouched (D-07 regression guard)", () => {
  it("keeps every premium number byte-identical", () => {
    expect(PRICING.IDR.monthly.amount).toBe(49000);
    expect(PRICING.IDR.annual.amount).toBe(249000);
    expect(PRICING.IDR.annual.savePercent).toBe(58);
    expect(PRICING.IDR.anchorAnnual.amount).toBe(588000);
  });
});

describe("clinician access is role-gated, not TierFeatures-gated (D-04)", () => {
  beforeEach(installLocalStorage);

  it("ALL_UNLOCKED still true and the studio feature still unlocked", () => {
    expect(ALL_UNLOCKED).toBe(true);
    expect(features().studio).toBe(true);
  });
});
