import { FADE_SEC } from "./constants";

/**
 * Gain-ramp discipline (ENG-06): every audible gain change goes through these
 * helpers. Direct `gain.value =` assignment while audio runs causes clicks;
 * an exponential ramp targeting exactly zero throws RangeError — both banned.
 */

export function fadeIn(
  param: AudioParam,
  target: number,
  t: number,
  dur: number = FADE_SEC,
): void {
  param.cancelScheduledValues(t);
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(target, t + dur);
}

export function fadeOut(param: AudioParam, t: number, dur: number = FADE_SEC): void {
  param.cancelScheduledValues(t);
  // Anchor at the current value so the ramp starts where the signal is (no jump).
  param.setValueAtTime(param.value, t);
  param.linearRampToValueAtTime(0.0001, t + dur);
  param.setValueAtTime(0, t + dur);
}

export function setGainSmooth(
  param: AudioParam,
  target: number,
  t: number,
  tc: number = 0.02,
): void {
  const clamped = Math.min(Math.max(target, 0), 1);
  param.setTargetAtTime(clamped, t, tc);
}
