import type { Band } from "../audio/presets";

export const BAND_COLORS: Record<Band, string> = {
  delta: "var(--band-delta)",
  theta: "var(--band-theta)",
  alpha: "var(--band-alpha)",
  beta: "var(--band-beta)",
  gamma: "var(--band-gamma)",
};

export const BAND_LABELS: Record<Band, string> = {
  delta: "Delta · deep sleep",
  theta: "Theta · meditation",
  alpha: "Alpha · relaxation",
  beta: "Beta · focus",
  gamma: "Gamma · energy",
};

/**
 * Each band's lower edge in Hz, low to high. A boundary belongs to the
 * HIGHER band, matching the documented mapping: delta <4, theta 4–8,
 * alpha 8–13, beta 13–30, gamma 30+.
 */
export const BAND_FLOORS: readonly { band: Band; fromHz: number }[] = [
  { band: "delta", fromHz: 0 },
  { band: "theta", fromHz: 4 },
  { band: "alpha", fromHz: 8 },
  { band: "beta", fromHz: 13 },
  { band: "gamma", fromHz: 30 },
];

/** Map a beat frequency to its brainwave band (see BAND_FLOORS). */
export function bandForHz(hz: number): Band {
  for (let i = BAND_FLOORS.length - 1; i > 0; i--) {
    if (hz >= BAND_FLOORS[i].fromHz) return BAND_FLOORS[i].band;
  }
  return "delta";
}

export function formatClock(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
