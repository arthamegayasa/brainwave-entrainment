import type { Preset } from "./presets";

/**
 * How the Beat moves between two points (docs/research/beat-journey-curves.md):
 * - "ease-in-out": S-curve, gentle at both ends (smoothstep);
 * - "linear": the same Hz every minute, as Presets ramp;
 * - "exponential": the same share every minute, as a change in tempo is heard;
 * - "wave": swings back to the Beat before and again to this one, `swings`
 *   arrivals in all, each half an S-curve.
 */
export type Easing = "ease-in-out" | "linear" | "exponential" | "wave";

export const EASINGS: readonly Easing[] = ["ease-in-out", "linear", "exponential", "wave"];

/** Swings a wave takes when none are given, and the range the Studio offers. */
export const DEFAULT_SWINGS = 3;
export const MIN_SWINGS = 2;
export const MAX_SWINGS = 8;

const smoothstep = (u: number) => u * u * (3 - 2 * u);

/** The Beat `u` (0..1) of the way through a move from `from` to `to` Hz. */
export function moveHz(from: number, to: number, u: number, easing: Easing, swings = DEFAULT_SWINGS): number {
  switch (easing) {
    case "ease-in-out":
      return from + (to - from) * smoothstep(u);
    case "exponential":
      return from * (to / from) ** u;
    case "wave": {
      // 2n − 1 halves, odd so the last one ends on `to`.
      const halves = 2 * swings - 1;
      const half = Math.min(Math.floor(u * halves), halves - 1);
      const s = smoothstep(u * halves - half);
      return half % 2 === 0 ? from + (to - from) * s : to + (from - to) * s;
    }
    default:
      return from + (to - from) * u;
  }
}

/** One point on the beat-frequency curve, seconds relative to session start. */
export interface SchedulePoint {
  time: number;
  hz: number;
  /** How the Beat moves here from the point before; absent = linear. */
  easing?: Easing;
  /** A wave's arrivals at this point's Beat. */
  swings?: number;
}

export interface SessionSchedule {
  points: SchedulePoint[];
  /** Session end in seconds, or null for an infinite session. */
  endSec: number | null;
  /**
   * The point where the Beat starts holding; the point after it, if any,
   * ends the hold and the points from there close the session.
   */
  holdIndex: number;
}

/**
 * Build the beat-frequency schedule for a preset and duration.
 *
 * Shape: startHz → (rampIn) → targetHz → hold → (rampOut) → endHz.
 * - rampIn is capped at 40% of the session, rampOut at 20%.
 * - endHz === null → no closing ramp (sleep stays low).
 * - durationSec === null → infinite: ramp in, then hold until stopped.
 */
export function buildSchedule(
  preset: Preset,
  durationSec: number | null,
): SessionSchedule {
  const rampInSec = preset.rampInMin * 60;

  if (durationSec === null) {
    return {
      points: [
        { time: 0, hz: preset.startHz },
        { time: rampInSec, hz: preset.targetHz },
      ],
      endSec: null,
      holdIndex: 1,
    };
  }

  const rampIn = Math.min(rampInSec, durationSec * 0.4);
  const points: SchedulePoint[] = [
    { time: 0, hz: preset.startHz },
    { time: rampIn, hz: preset.targetHz },
  ];

  if (preset.endHz !== null && preset.rampOutMin > 0) {
    const rampOut = Math.min(preset.rampOutMin * 60, durationSec * 0.2);
    points.push({ time: durationSec - rampOut, hz: preset.targetHz });
    points.push({ time: durationSec, hz: preset.endHz });
  } else {
    points.push({ time: durationSec, hz: preset.targetHz });
  }

  return { points, endSec: durationSec, holdIndex: 1 };
}

/** Beat frequency at `t` seconds into the session, eased between points. */
export function beatAt(schedule: SessionSchedule, t: number): number {
  const points = schedule.points;
  if (t <= points[0].time) return points[0].hz;
  for (let i = 1; i < points.length; i++) {
    if (t <= points[i].time) {
      const prev = points[i - 1];
      const next = points[i];
      const span = next.time - prev.time;
      if (span <= 0) return next.hz;
      return moveHz(prev.hz, next.hz, (t - prev.time) / span, next.easing ?? "linear", next.swings);
    }
  }
  return points[points.length - 1].hz;
}

/** Straight pieces per eased move, or per half of a wave: about 0.1% of it off the true curve. */
const EASED_PIECES = 32;

/**
 * The schedule from `fromSec` on as straight pieces, times relative to
 * `fromSec`: what an AudioParam's linear ramps can play, eased moves
 * included. It opens at the Beat of `fromSec`, so a layer that joins late
 * starts where the session is.
 */
export function beatPath(schedule: SessionSchedule, fromSec = 0): SchedulePoint[] {
  const path: SchedulePoint[] = [{ time: 0, hz: beatAt(schedule, fromSec) }];
  const points = schedule.points;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const next = points[i];
    if (next.time <= fromSec) continue;
    const easing = next.easing ?? "linear";
    const swings = next.swings ?? DEFAULT_SWINGS;
    const pieces =
      easing === "linear" || next.hz === prev.hz
        ? 1
        : EASED_PIECES * (easing === "wave" ? 2 * swings - 1 : 1);
    for (let k = 1; k <= pieces; k++) {
      const time = prev.time + ((next.time - prev.time) * k) / pieces;
      if (time <= fromSec || time - fromSec <= path[path.length - 1].time) continue;
      path.push({ time: time - fromSec, hz: moveHz(prev.hz, next.hz, k / pieces, easing, swings) });
    }
  }
  return path;
}

export type SessionPhase = "rampIn" | "hold" | "rampOut" | "done";

/**
 * Which phase of the curve `t` falls in (for the Player): moving toward the
 * hold, holding, or closing after it. A flat stretch anywhere holds.
 */
export function phaseAt(schedule: SessionSchedule, t: number): SessionPhase {
  const { points, holdIndex } = schedule;
  if (schedule.endSec !== null && t >= schedule.endSec) return "done";
  const holdEnd = points[holdIndex + 1];
  if (t >= points[holdIndex].time && (!holdEnd || t < holdEnd.time)) return "hold";
  const next = points.find((p) => p.time > t) ?? points[points.length - 1];
  const prev = points[Math.max(0, points.indexOf(next) - 1)];
  if (next.hz === prev.hz) return "hold";
  return t < points[holdIndex].time ? "rampIn" : "rampOut";
}
