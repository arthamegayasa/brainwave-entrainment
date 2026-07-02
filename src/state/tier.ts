/**
 * Monetization scaffold (MON-01). The gating architecture is live but this
 * build ships with everything unlocked (ALL_UNLOCKED) — wiring a payment
 * provider later only requires flipping the flag and setting tiers from a
 * backend/receipt instead of localStorage.
 */

export type Tier = "free" | "premium";

/** Build-level switch: true = every feature unlocked regardless of tier. */
export const ALL_UNLOCKED = true;

export interface TierFeatures {
  /** Preset ids locked behind premium when gating is active. */
  premiumPresets: boolean;
  /** Studio (advanced builder). */
  studio: boolean;
  /** Infinite session duration. */
  infiniteDuration: boolean;
}

const PREMIUM_FEATURES: TierFeatures = {
  premiumPresets: true,
  studio: true,
  infiniteDuration: true,
};

const FREE_FEATURES: TierFeatures = {
  premiumPresets: false,
  studio: false,
  infiniteDuration: false,
};

const KEY = "serenade.tier.v1";

export function getTier(): Tier {
  try {
    return localStorage.getItem(KEY) === "premium" ? "premium" : "free";
  } catch {
    return "free";
  }
}

export function setTier(tier: Tier): void {
  try {
    localStorage.setItem(KEY, tier);
  } catch {
    /* storage unavailable — stay in-memory free */
  }
}

export function features(): TierFeatures {
  if (ALL_UNLOCKED) return PREMIUM_FEATURES;
  return getTier() === "premium" ? PREMIUM_FEATURES : FREE_FEATURES;
}

/** Whether a given feature is available right now. */
export function isUnlocked(feature: keyof TierFeatures): boolean {
  return features()[feature];
}
