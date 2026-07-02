import type { Preset } from "./presets";

/** One point on the beat-frequency curve, seconds relative to session start. */
export interface SchedulePoint {
  time: number;
  hz: number;
}

export interface SessionSchedule {
  points: SchedulePoint[];
  /** Session end in seconds, or null for an infinite session. */
  endSec: number | null;
}

/**
 * Build the beat-frequency schedule for a preset and duration (SCH-01).
 *
 * Shape: startHz → (rampIn) → targetHz → hold → (rampOut) → endHz.
 * - rampIn is capped at 40% of the session, rampOut at 20%.
 * - endHz === null → no closing ramp (SCH-02, sleep stays low).
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

  return { points, endSec: durationSec };
}

/** Piecewise-linear beat frequency at `t` seconds into the session. */
export function beatAt(schedule: SessionSchedule, t: number): number {
  const points = schedule.points;
  if (t <= points[0].time) return points[0].hz;
  for (let i = 1; i < points.length; i++) {
    if (t <= points[i].time) {
      const prev = points[i - 1];
      const next = points[i];
      const span = next.time - prev.time;
      if (span <= 0) return next.hz;
      const frac = (t - prev.time) / span;
      return prev.hz + (next.hz - prev.hz) * frac;
    }
  }
  return points[points.length - 1].hz;
}

export type SessionPhase = "rampIn" | "hold" | "rampOut" | "done";

/** Which phase of the curve `t` falls in (for the frequency detail panel). */
export function phaseAt(schedule: SessionSchedule, t: number): SessionPhase {
  const points = schedule.points;
  if (schedule.endSec !== null && t >= schedule.endSec) return "done";
  if (t < points[1].time) return "rampIn";
  const last = points[points.length - 1];
  const secondLast = points[points.length - 2];
  if (points.length >= 4 && t >= secondLast.time && last.hz !== secondLast.hz) {
    return "rampOut";
  }
  return "hold";
}
