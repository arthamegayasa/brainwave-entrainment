import type { Band } from "../audio/presets";

export const BAND_COLORS: Record<Band, string> = {
  delta: "var(--band-delta)",
  theta: "var(--band-theta)",
  alpha: "var(--band-alpha)",
  beta: "var(--band-beta)",
  gamma: "var(--band-gamma)",
};

export const BAND_LABELS_ID: Record<Band, string> = {
  delta: "Delta · tidur dalam",
  theta: "Theta · meditasi",
  alpha: "Alpha · relaks",
  beta: "Beta · fokus",
  gamma: "Gamma · energi",
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
