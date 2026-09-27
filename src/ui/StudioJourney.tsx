import type { CSSProperties } from "react";
import { curveSchedule } from "../audio/builder";
import type { BuilderCurve } from "../audio/builder";
import { BAND_COLORS, BAND_FLOORS, bandForHz } from "./bands";
import { DurationRow } from "./DurationRow";
import { BandChip, RangeField } from "./StudioField";

/** Longest share of a timed session each ramp may take (buildSchedule's caps). */
const EASE_IN_CAP = 0.4;
const EASE_OUT_CAP = 0.2;

const minutes = (sec: number) => Number((sec / 60).toFixed(1));

interface JourneyEditorProps {
  curve: BuilderCurve;
  /** Preview length; null = ∞. */
  durationMin: number | null;
  onCurveChange: (curve: BuilderCurve) => void;
  onDurationChange: (durationMin: number | null) => void;
  /** Where the preview is while one plays: its time and live Beat. */
  live: { elapsedSec: number; hz: number } | null;
  /** The preview still plays the journey it started with. */
  stale: boolean;
  onRestart: () => void;
}

/**
 * The session curve as a journey: a chart of the Beat over time on the
 * brainwave bands, and its three stops (Start, Target, End) as controls.
 * The chart draws the schedule the engine plays, ramp caps included.
 */
export function JourneyEditor({
  curve,
  durationMin,
  onCurveChange,
  onDurationChange,
  live,
  stale,
  onRestart,
}: JourneyEditorProps) {
  const patch = (p: Partial<BuilderCurve>) => onCurveChange({ ...curve, ...p });
  const easeInCapped = durationMin !== null && curve.rampInMin > durationMin * EASE_IN_CAP;
  const easeOutCapped =
    durationMin !== null && curve.endHz !== null && curve.rampOutMin > durationMin * EASE_OUT_CAP;

  return (
    <div className="journey">
      <JourneyChart curve={curve} durationMin={durationMin} live={live} />
      {stale && (
        <p className="journey-stale" role="status">
          The preview keeps the journey it started with.
          <button className="chip small" onClick={onRestart}>
            <span aria-hidden>↻ </span>Restart preview
          </button>
        </p>
      )}

      <DurationRow value={durationMin} onChange={onDurationChange} label="Preview length (min)" />
      <p className="journey-note">Listeners pick their own length when they play it.</p>

      <div className="journey-stops">
        <div className="journey-stop" style={{ "--band": BAND_COLORS[bandForHz(curve.startHz)] } as CSSProperties}>
          <div className="journey-stop-head">
            <span className="journey-stop-mark" aria-hidden>1</span>
            <h3>Start</h3>
            <BandChip hz={curve.startHz} full />
          </div>
          <RangeField
            label="Beat"
            name="Start Beat"
            unit="Hz"
            value={curve.startHz}
            min={0.5}
            max={50}
            step={0.1}
            log
            tone={BAND_COLORS[bandForHz(curve.startHz)]}
            onChange={(startHz) => patch({ startHz })}
          />
          <p className="journey-note">Where the Beat begins, usually near waking (10–14 Hz).</p>
        </div>

        <div className="journey-stop" style={{ "--band": BAND_COLORS[bandForHz(curve.targetHz)] } as CSSProperties}>
          <div className="journey-stop-head">
            <span className="journey-stop-mark" aria-hidden>2</span>
            <h3>Target</h3>
            <BandChip hz={curve.targetHz} full />
          </div>
          <RangeField
            label="Beat"
            name="Target Beat"
            unit="Hz"
            value={curve.targetHz}
            min={0.5}
            max={50}
            step={0.1}
            log
            tone={BAND_COLORS[bandForHz(curve.targetHz)]}
            onChange={(targetHz) => patch({ targetHz })}
          />
          <RangeField
            label="Ease in"
            unit="min"
            value={curve.rampInMin}
            min={0.5}
            max={60}
            step={0.5}
            inputStep={0.1}
            tone={BAND_COLORS[bandForHz(curve.targetHz)]}
            onChange={(rampInMin) => patch({ rampInMin })}
          />
          {easeInCapped && durationMin !== null && (
            <p className="journey-note is-capped">
              Plays as {durationMin * EASE_IN_CAP} min: easing in takes at most 40% of a session.
            </p>
          )}
        </div>

        <div
          className={`journey-stop${curve.endHz === null ? " is-off" : ""}`}
          style={{ "--band": BAND_COLORS[bandForHz(curve.endHz ?? curve.targetHz)] } as CSSProperties}
        >
          <div className="journey-stop-head">
            <span className="journey-stop-mark" aria-hidden>3</span>
            <h3>End</h3>
            {curve.endHz !== null && <BandChip hz={curve.endHz} full />}
          </div>
          <label className="switch">
            <input
              type="checkbox"
              role="switch"
              checked={curve.endHz !== null}
              onChange={(e) => patch({ endHz: e.target.checked ? curve.startHz : null })}
            />
            <span className="switch-track" aria-hidden />
            Return at the end
          </label>
          {curve.endHz === null ? (
            <p className="journey-note">Holds the target to the end, as sleep sessions do.</p>
          ) : (
            <>
              <RangeField
                label="Beat"
                name="End Beat"
                unit="Hz"
                value={curve.endHz}
                min={0.5}
                max={50}
                step={0.1}
                log
                tone={BAND_COLORS[bandForHz(curve.endHz)]}
                onChange={(endHz) => patch({ endHz })}
              />
              <RangeField
                label="Ease out"
                unit="min"
                value={curve.rampOutMin}
                min={0.5}
                max={30}
                step={0.5}
                tone={BAND_COLORS[bandForHz(curve.endHz)]}
                onChange={(rampOutMin) => patch({ rampOutMin })}
              />
              {easeOutCapped && durationMin !== null && (
                <p className="journey-note is-capped">
                  Plays as {durationMin * EASE_OUT_CAP} min: easing out takes at most 20% of a session.
                </p>
              )}
              {durationMin === null && (
                <p className="journey-note">An endless preview holds the target; timed Plays end this way.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The Beat over the session on the band stripes. Shapes are one stretched
 * SVG; dots and labels are HTML placed in percent, so they stay round and
 * legible at any width.
 */
function JourneyChart({
  curve,
  durationMin,
  live,
}: {
  curve: BuilderCurve;
  durationMin: number | null;
  live: { elapsedSec: number; hz: number } | null;
}) {
  const schedule = curveSchedule(curve, durationMin === null ? null : durationMin * 60);
  const points = schedule.points;
  const reached = points[1];
  // An endless session holds its target after easing in: draw the hold on, dashed.
  const spanSec = schedule.endSec ?? Math.max(reached.time * 1.6, reached.time + 300);
  const last = points[points.length - 1];
  const topHz = Math.max(6, ...points.map((p) => p.hz), live?.hz ?? 0) * 1.3;
  const x = (sec: number) => (Math.min(sec, spanSec) / spanSec) * 100;
  const y = (hz: number) => (1 - hz / topHz) * 100;

  const line = points.map((p, i) => `${i ? "L" : "M"} ${x(p.time)} ${y(p.hz)}`).join(" ");
  const easesOut = points.length === 4;
  const holdEnd = easesOut ? points[2].time : spanSec;

  const phases = [
    { name: "Ease in", from: 0, to: reached.time },
    { name: schedule.endSec === null ? "Hold ∞" : "Hold", from: reached.time, to: holdEnd },
    ...(easesOut ? [{ name: "Ease out", from: holdEnd, to: points[3].time }] : []),
  ].filter((phase) => x(phase.to) - x(phase.from) >= 14);

  const marks = [
    { key: "start", sec: 0, hz: points[0].hz },
    { key: "target", sec: reached.time, hz: reached.hz },
    ...(easesOut ? [{ key: "end", sec: points[3].time, hz: points[3].hz }] : []),
  ];

  // Time ticks at every turn; a middle tick too close to its neighbour drops.
  const tickSecs = [0, reached.time, ...(easesOut ? [holdEnd] : []), spanSec];
  const ticks = tickSecs.filter(
    (sec, i) =>
      i === 0 ||
      i === tickSecs.length - 1 ||
      (x(sec) - x(tickSecs[i - 1]) >= 10 && 100 - x(sec) >= 10),
  );

  // Stripes for the bands under the chart's top, high to low for the gradient.
  const bands = BAND_FLOORS.map((floor, i) => ({
    band: floor.band,
    from: floor.fromHz,
    to: Math.min(BAND_FLOORS[i + 1]?.fromHz ?? Infinity, topHz),
  }))
    .filter((b) => b.from < topHz)
    .reverse();

  const summary =
    `Beat from ${points[0].hz} Hz, easing to ${reached.hz} Hz over ${minutes(reached.time)} min, ` +
    (schedule.endSec === null
      ? "then holding until stopped."
      : easesOut
        ? `holding, then returning to ${points[3].hz} Hz over the last ${minutes(points[3].time - holdEnd)} min of ${minutes(schedule.endSec)}.`
        : `then holding to the end of ${minutes(schedule.endSec)} min.`);

  return (
    <figure className="journey-chart">
      <div className="journey-axis" aria-hidden>
        {bands.map((b) => (
          <span
            key={b.band}
            className="journey-axis-band"
            style={{ top: `${y(b.to)}%`, height: `${((b.to - b.from) / topHz) * 100}%`, color: BAND_COLORS[b.band] } as CSSProperties}
          >
            {(b.to - b.from) / topHz >= 0.09 && b.band}
          </span>
        ))}
      </div>
      <div className="journey-plot" role="img" aria-label={summary}>
        {bands.map((b) => (
          <span
            key={b.band}
            className="journey-band"
            style={{ top: `${y(b.to)}%`, height: `${((b.to - b.from) / topHz) * 100}%`, "--band": BAND_COLORS[b.band] } as CSSProperties}
          />
        ))}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <defs>
            {/* Colour follows the band the line passes through. */}
            <linearGradient id="journey-hue" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="100">
              {bands.flatMap((b) => [
                <stop key={`${b.band}-to`} offset={y(b.to) / 100} stopColor={BAND_COLORS[b.band]} />,
                <stop key={`${b.band}-from`} offset={y(b.from) / 100} stopColor={BAND_COLORS[b.band]} />,
              ])}
            </linearGradient>
            <linearGradient id="journey-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${line} L 100 ${y(last.hz)} L 100 100 L 0 100 Z`} fill="url(#journey-fill)" />
          <path
            d={line}
            fill="none"
            stroke="url(#journey-hue)"
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            className="journey-line"
          />
          {schedule.endSec === null && (
            <path
              d={`M ${x(reached.time)} ${y(reached.hz)} L 100 ${y(reached.hz)}`}
              className="journey-endless"
              stroke={BAND_COLORS[bandForHz(reached.hz)]}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {phases.map((phase) => (
          <span
            key={phase.name}
            className="journey-phase"
            style={{ left: `${(x(phase.from) + x(phase.to)) / 2}%` }}
            aria-hidden
          >
            {phase.name}
          </span>
        ))}

        {marks.map((m) => (
          <span
            key={m.key}
            className={`journey-mark is-${m.key}${y(m.hz) < 24 ? " is-low-label" : ""}`}
            style={{ left: `${x(m.sec)}%`, top: `${y(m.hz)}%`, "--band": BAND_COLORS[bandForHz(m.hz)] } as CSSProperties}
            aria-hidden
          >
            <span className="journey-mark-label">{m.hz} Hz</span>
          </span>
        ))}

        {live && (
          <span
            className="journey-now"
            style={{ left: `${x(live.elapsedSec)}%`, "--now": `${y(live.hz)}%`, "--band": BAND_COLORS[bandForHz(live.hz)] } as CSSProperties}
            aria-hidden
          />
        )}
      </div>
      <span className="journey-ticks-unit" aria-hidden>
        min
      </span>
      <div className="journey-ticks" aria-hidden>
        {ticks.map((sec, i) => (
          <span key={sec} style={{ left: `${x(sec)}%` }} className={i === 0 ? "is-first" : i === ticks.length - 1 ? "is-last" : ""}>
            {i === ticks.length - 1 && schedule.endSec === null ? "∞" : minutes(sec)}
          </span>
        ))}
      </div>
    </figure>
  );
}
