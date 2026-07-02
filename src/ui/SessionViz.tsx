import type { SessionSchedule } from "../audio/schedule";
import { beatAt } from "../audio/schedule";

interface SessionVizProps {
  schedule: SessionSchedule | null;
  elapsedSec: number;
  durationSec: number | null;
}

/**
 * Live session visualization (PWA-04): the beat-frequency curve with a moving
 * "you are here" marker. Pure SVG — cheap to repaint each tick.
 */
export function SessionViz({ schedule, elapsedSec, durationSec }: SessionVizProps) {
  if (!schedule) return null;

  const W = 320;
  const H = 96;
  const pad = 8;

  // X axis spans the full session (or a rolling 30-min window when infinite).
  const span = durationSec ?? Math.max(elapsedSec + 60, 30 * 60);
  const samples = 60;
  const points: string[] = [];
  let minHz = Infinity;
  let maxHz = -Infinity;
  const hzAt: number[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = (span * i) / samples;
    const hz = beatAt(schedule, t);
    hzAt.push(hz);
    minHz = Math.min(minHz, hz);
    maxHz = Math.max(maxHz, hz);
  }
  const range = Math.max(0.5, maxHz - minHz);
  for (let i = 0; i <= samples; i++) {
    const x = pad + ((W - 2 * pad) * i) / samples;
    const y = pad + (H - 2 * pad) * (1 - (hzAt[i] - minHz) / range);
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }

  const progress = Math.min(1, elapsedSec / span);
  const markerX = pad + (W - 2 * pad) * progress;
  const nowHz = beatAt(schedule, elapsedSec);
  const markerY = pad + (H - 2 * pad) * (1 - (nowHz - minHz) / range);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="session-viz" role="img" aria-label="Kurva frekuensi sesi">
      <defs>
        <linearGradient id="vizfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`${pad},${H - pad} ${points.join(" ")} ${W - pad},${H - pad}`}
        fill="url(#vizfill)"
      />
      <polyline points={points.join(" ")} fill="none" stroke="var(--accent)" strokeWidth="2" />
      <line
        x1={markerX}
        y1={pad}
        x2={markerX}
        y2={H - pad}
        stroke="var(--ink-faint)"
        strokeWidth="1"
        strokeDasharray="3 3"
      />
      <circle cx={markerX} cy={markerY} r="4" fill="var(--ink)" stroke="var(--accent)" strokeWidth="2" />
    </svg>
  );
}
