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

export function formatClock(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
