import { describe, expect, it } from "vitest";
import { isPremiumUser } from "../src/state/tier";

describe("Premium (ADR-014)", () => {
  it("counts a Patient whose Link carries the Premium grant, without a subscription", () => {
    expect(isPremiumUser({ subscription: null, premiumGrant: true })).toBe(true);
    expect(isPremiumUser({ subscription: { tier: "free", status: "inactive" }, premiumGrant: true })).toBe(
      true,
    );
  });

  it("counts an active Premium or Clinician subscription, with or without the grant", () => {
    for (const tier of ["premium", "clinician"] as const) {
      for (const premiumGrant of [false, true]) {
        expect(isPremiumUser({ subscription: { tier, status: "active" }, premiumGrant }), tier).toBe(true);
      }
    }
  });

  it("does not count a subscription that is not active, nor a free one, without the grant", () => {
    const subscriptions = [
      null,
      { tier: "free", status: "active" },
      { tier: "premium", status: "pending" },
      { tier: "premium", status: "expired" },
      { tier: "clinician", status: "inactive" },
    ] as const;
    for (const subscription of subscriptions) {
      expect(isPremiumUser({ subscription, premiumGrant: false }), JSON.stringify(subscription)).toBe(false);
    }
  });
});
