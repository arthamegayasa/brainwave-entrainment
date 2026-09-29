import { useId, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { MAX_MOVE_MIN, journeyMinutes, journeySchedule, moveScale, retimePoint } from "../audio/builder";
import type { Journey, JourneyPoint } from "../audio/builder";
import { DEFAULT_SWINGS, EASINGS, MAX_SWINGS, MIN_SWINGS, beatPath } from "../audio/schedule";
import type { Easing, SessionSchedule } from "../audio/schedule";
import { MAX_JOURNEY_POINTS } from "../state/customPresets";
import { BAND_COLORS, BAND_FLOORS, bandForHz } from "./bands";
import { DurationRow } from "./DurationRow";
import { BandChip, RangeField } from "./StudioField";

const minutes = (sec: number) => Number((sec / 60).toFixed(1));

/** Each Easing as the Studio names and draws it: a rising move in a 24 px box. */
const EASING_META: Record<Easing, { label: string; hint: string; path: string }> = {
  "ease-in-out": {
    label: "S-curve",
    hint: "Gentle at both ends, quicker in the middle.",
    path: "M3 20C9 20 15 4 21 4",
  },
  linear: { label: "Linear", hint: "The same Hz every minute, as Presets move.", path: "M3 20L21 4" },
  exponential: {
    label: "Proportional",
    hint: "The same share every minute: quicker at high Beats, gentler at low ones.",
    path: "M3 20C12 19 18 12 21 4",
  },
  wave: {
    label: "Wave",
    hint: "Swings between the Beat before and this one, ending here.",
    path: "M3 20C6 20 6 4 9 4S12 20 15 20S18 4 21 4",
  },
};

/** When a Journey point arrives in `schedule`, in seconds; null when an endless one never reaches it. */
function arrivalSec(schedule: SessionSchedule, journey: Journey, index: number): number | null {
  if (index <= journey.holdAt) return schedule.points[index + 1].time;
  return schedule.endSec === null ? null : schedule.points[index + 2].time;
}

interface JourneyEditorProps {
  journey: Journey;
  /** Preview length; null = ∞. */
  durationMin: number | null;
  onChange: (journey: Journey) => void;
  /** Where the preview is while one plays: its time and the Journey's live Beat. */
  live: { elapsedSec: number; hz: number } | null;
  /** The preview's length and Restart, shown under the chart. */
  preview: ReactNode;
  /** Which layers ride the Journey when the main Beat does not; null when it does. */
  followers: string | null;
}

/**
 * The Journey: a chart of the Beat over time on the brainwave bands, then its
 * Start and points as controls. The chart draws the schedule the engine plays.
 */
export function JourneyEditor({ journey, durationMin, onChange, live, preview, followers }: JourneyEditorProps) {
  const holdGroup = useId();
  const schedule = journeySchedule(journey, durationMin === null ? null : durationMin * 60);
  const { points, holdAt } = journey;
  const movesMin = Number(journeyMinutes(journey).toFixed(1));
  const leadMin = Number(journeyMinutes({ ...journey, points: points.slice(0, holdAt + 1) }).toFixed(1));
  const restMin = durationMin === null ? 0 : Number((durationMin - movesMin).toFixed(1));

  const setPoint = (index: number, patch: Partial<JourneyPoint>) =>
    onChange({ ...journey, points: points.map((p, i) => (i === index ? { ...p, ...patch } : p)) });

  const removePoint = (index: number) =>
    onChange({
      ...journey,
      points: points.filter((_, i) => i !== index),
      holdAt: index <= holdAt ? Math.max(0, holdAt - 1) : holdAt,
    });

  let timing: string;
  if (durationMin === null) {
    timing =
      `An endless preview moves for ${leadMin} min, then holds Point ${holdAt + 2}` +
      (holdAt < points.length - 1 ? "; timed Plays close with the points after it." : ".");
  } else if (restMin < 0) {
    timing = `The moves take ${movesMin} min: this ${durationMin}-min preview runs them ${(movesMin / durationMin).toFixed(1)}× faster, without a Hold.`;
  } else if (restMin === 0) {
    timing = `The moves fill this ${durationMin}-min preview exactly.`;
  } else {
    timing = `The moves take ${movesMin} min; the Hold fills the other ${restMin} min of this preview.`;
  }

  return (
    <div className="studio-journey">
      <div className="journey-head">
        <h3>Journey</h3>
        <p>Start near waking, then add the points the Beat moves through, one after another. Drag a point on the chart to move it.</p>
        {followers && <p className="journey-note">The main Beat is fixed; {followers} this Journey.</p>}
      </div>
      <JourneyChart
        journey={journey}
        schedule={schedule}
        durationSec={durationMin === null ? null : durationMin * 60}
        live={live}
        onChange={onChange}
      />
      <p className={`journey-note${restMin < 0 ? " is-capped" : ""}`}>{timing}</p>
      {preview}
      <p className="journey-note">
        Listeners pick their own length when they play it: the Hold stretches to fit, and a Play shorter than the moves runs them faster.
      </p>

      <ol className="journey-stops">
        <li className="journey-stop" style={{ "--band": BAND_COLORS[bandForHz(journey.startHz)] } as CSSProperties}>
          <div className="journey-stop-head">
            <span className="journey-stop-mark" aria-hidden>1</span>
            <h4>Start</h4>
            <BandChip hz={journey.startHz} full />
          </div>
          <RangeField
            label="Beat"
            name="Start Beat"
            unit="Hz"
            value={journey.startHz}
            min={0.5}
            max={50}
            step={0.1}
            log
            tone={BAND_COLORS[bandForHz(journey.startHz)]}
            onChange={(startHz) => onChange({ ...journey, startHz })}
          />
          <p className="journey-note">Where the Beat begins, usually near waking (10–14 Hz).</p>
        </li>

        {points.map((point, i) => {
          const n = i + 2;
          const tone = BAND_COLORS[bandForHz(point.hz)];
          const fromHz = i === 0 ? journey.startHz : points[i - 1].hz;
          const at = arrivalSec(schedule, journey, i);
          return (
            <li
              key={i}
              className={`journey-stop${i === holdAt && points.length > 1 ? " is-hold" : ""}`}
              style={{ "--band": tone } as CSSProperties}
              aria-label={`Point ${n}`}
            >
              <div className="journey-stop-head">
                <span className="journey-stop-mark" aria-hidden>{n}</span>
                <h4>Point {n}</h4>
                <BandChip hz={point.hz} full />
                {points.length > 1 && (
                  <button className="journey-stop-remove" aria-label={`Remove point ${n}`} onClick={() => removePoint(i)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                )}
              </div>
              <RangeField
                label="Beat"
                name={`Point ${n} Beat`}
                unit="Hz"
                value={point.hz}
                min={0.5}
                max={50}
                step={0.1}
                log
                tone={tone}
                onChange={(hz) => setPoint(i, { hz })}
              />
              <RangeField
                label="Reach in"
                name={`Point ${n} reach in`}
                unit="min"
                value={point.minutes}
                min={0.5}
                max={MAX_MOVE_MIN}
                step={0.5}
                inputStep={0.1}
                tone={tone}
                onChange={(m) => setPoint(i, { minutes: m })}
              />
              <EasingPicker
                name={`Point ${n} curve`}
                value={point.easing}
                direction={Math.sign(point.hz - fromHz)}
                onChange={(easing) =>
                  setPoint(i, { easing, swings: easing === "wave" ? (point.swings ?? DEFAULT_SWINGS) : undefined })
                }
              />
              {point.easing === "wave" && (
                <WaveSwings
                  name={`Point ${n} wave`}
                  fromHz={fromHz}
                  point={point}
                  tone={tone}
                  onChange={(swings) => setPoint(i, { swings })}
                />
              )}
              <div className="journey-stop-foot">
                {points.length > 1 && (
                  <label className="journey-hold">
                    <input
                      type="radio"
                      name={holdGroup}
                      checked={i === holdAt}
                      onChange={() => onChange({ ...journey, holdAt: i })}
                    />
                    Hold here
                  </label>
                )}
                <span className="journey-note">
                  {at === null ? "At the end of a timed Play" : `At ${minutes(at)} min`}
                </span>
              </div>
            </li>
          );
        })}

        <li className="journey-add">
          <button
            className="journey-add-btn"
            disabled={points.length >= MAX_JOURNEY_POINTS}
            onClick={() =>
              // A new point starts where the Journey ends, 5 min on, on an S-curve.
              onChange({
                ...journey,
                points: [...points, { hz: points[points.length - 1].hz, minutes: 5, easing: "ease-in-out" }],
              })
            }
          >
            <span aria-hidden>+</span> Add point
          </button>
          <p className="journey-note">
            {points.length >= MAX_JOURNEY_POINTS
              ? `A Journey holds up to ${MAX_JOURNEY_POINTS} points.`
              : points.length > 1
                ? "Points after the Hold close the session."
                : "The last point holds to the end."}
          </p>
        </li>
      </ol>
    </div>
  );
}

/** The preview's length, and the Restart a journey or length edit waits for. */
export function PreviewLength({
  durationMin,
  onChange,
  stale,
  onRestart,
}: {
  durationMin: number | null;
  onChange: (durationMin: number | null) => void;
  stale: boolean;
  onRestart: () => void;
}) {
  return (
    <>
      {stale && (
        <p className="journey-stale" role="status">
          The preview keeps the journey it started with.
          <button className="chip small" onClick={onRestart}>
            <span aria-hidden>↻ </span>Restart preview
          </button>
        </p>
      )}
      <DurationRow value={durationMin} onChange={onChange} label="Preview length (min)" />
    </>
  );
}

/** The four Easings as drawn buttons; a falling move draws them falling. */
function EasingPicker({
  name,
  value,
  direction,
  onChange,
}: {
  name: string;
  value: Easing;
  /** −1 falling, 1 rising, 0 flat. */
  direction: number;
  onChange: (easing: Easing) => void;
}) {
  const labelId = useId();
  return (
    <div className={`easing${direction < 0 ? " is-down" : ""}`}>
      <div className="rf-head">
        <span className="rf-label" id={labelId}>
          Curve
        </span>
        <span className="easing-name">{EASING_META[value].label}</span>
      </div>
      <div className="easing-options" role="group" aria-label={name}>
        {EASINGS.map((easing) => (
          <button
            key={easing}
            aria-pressed={value === easing}
            aria-label={EASING_META[easing].label}
            title={`${EASING_META[easing].label}: ${EASING_META[easing].hint}`}
            onClick={() => onChange(easing)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d={EASING_META[easing].path} />
            </svg>
          </button>
        ))}
      </div>
      <p className="journey-note">{EASING_META[value].hint}</p>
    </div>
  );
}

/**
 * A wave's swings, with what they come to: how long each pass takes, and a
 * hint when passes under a minute or swings wider than 3 Hz would be heard as
 * a wobble rather than a guide (docs/research/beat-journey-curves.md).
 */
function WaveSwings({
  name,
  fromHz,
  point,
  tone,
  onChange,
}: {
  name: string;
  fromHz: number;
  point: JourneyPoint;
  tone: string;
  onChange: (swings: number) => void;
}) {
  const swings = point.swings ?? DEFAULT_SWINGS;
  const passes = 2 * swings - 1;
  const passMin = Number((point.minutes / passes).toFixed(1));
  const depth = Math.abs(point.hz - fromHz);
  const caution =
    depth === 0
      ? "Give this point a Beat other than the one before to swing."
      : passMin < 1
        ? "Passes under a minute are heard as a wobble: fewer swings or a longer move guide more gently."
        : depth > 3
          ? "Swings of 1–2 Hz are the gentler guide."
          : null;
  return (
    <>
      <RangeField
        label="Swings"
        name={name}
        unit="swings"
        value={swings}
        min={MIN_SWINGS}
        max={MAX_SWINGS}
        step={1}
        tone={tone}
        onChange={onChange}
      />
      <p className="journey-note">
        {fromHz} ↔ {point.hz} Hz: {passes} passes of {passMin} min, ending on {point.hz} Hz.
      </p>
      {caution && <p className="journey-note is-capped">{caution}</p>}
    </>
  );
}

/** The chart's scales while a point is dragged: frozen, so the point stays under the pointer. */
interface Drag {
  n: number;
  topHz: number;
  spanSec: number;
}

const snapHz = (hz: number) => Math.min(Math.max(Math.round(hz * 10) / 10, 0.5), 50);

/**
 * The Beat over the session on the band stripes, with its points to drag:
 * the Start up and down, every other point also along the time, except a
 * closing's last point, which sits on the end. Shapes are one stretched SVG;
 * points, labels, and the axis are HTML placed in percent, so they stay
 * round and legible at any width.
 */
function JourneyChart({
  journey,
  schedule,
  durationSec,
  live,
  onChange,
}: {
  journey: Journey;
  schedule: SessionSchedule;
  durationSec: number | null;
  live: { elapsedSec: number; hz: number } | null;
  onChange: (journey: Journey) => void;
}) {
  const plotRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const { points, holdIndex, endSec } = schedule;
  const hold = points[holdIndex];
  // An endless session holds after its moves: draw the Hold on, dashed.
  const spanSec = drag?.spanSec ?? endSec ?? Math.max(hold.time * 1.25, hold.time + 300);
  const holdEndSec = endSec === null ? spanSec : points[holdIndex + 1].time;
  const topHz = drag?.topHz ?? Math.max(6, ...points.map((p) => p.hz), live?.hz ?? 0) * 1.3;
  const x = (sec: number) => (Math.min(sec, spanSec) / spanSec) * 100;
  const y = (hz: number) => (1 - hz / topHz) * 100;

  const path = beatPath(schedule);
  const line = path.map((p, i) => `${i ? "L" : "M"} ${x(p.time)} ${y(p.hz)}`).join(" ");
  const last = path[path.length - 1];

  // Start, then each point the schedule reaches; the Hold's end is not a point.
  const marks = [
    { n: 1, sec: 0, hz: journey.startHz, alongTime: false },
    ...journey.points.flatMap((p, i) => {
      const at = arrivalSec(schedule, journey, i);
      const pinned = i > journey.holdAt && i === journey.points.length - 1;
      return at === null ? [] : [{ n: i + 2, sec: at, hz: p.hz, alongTime: !pinned }];
    }),
  ];
  // A label that would sit on the one before it is left to its point's card.
  let shownAt: { x: number; y: number } | null = null;
  const labelled = marks.map((m) => {
    const here = { x: x(m.sec), y: y(m.hz) };
    const clear = m.n === drag?.n || !shownAt || Math.abs(here.x - shownAt.x) >= 9 || Math.abs(here.y - shownAt.y) >= 16;
    if (clear) shownAt = here;
    return clear;
  });

  /** Move mark `n` to `hz` and, if it moves along the time, to `atSec`. */
  const moveMark = (n: number, hz: number, atSec: number | null) => {
    const i = n - 2;
    let next =
      n === 1
        ? { ...journey, startHz: hz }
        : { ...journey, points: journey.points.map((p, k) => (k === i ? { ...p, hz } : p)) };
    if (n > 1 && atSec !== null) next = retimePoint(next, i, atSec, durationSec);
    if (JSON.stringify(next) !== JSON.stringify(journey)) onChange(next);
  };

  const dragTo = (m: (typeof marks)[number], clientX: number, clientY: number) => {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect || !drag) return;
    const fx = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    const fy = Math.min(Math.max((clientY - rect.top) / rect.height, 0), 1);
    moveMark(m.n, snapHz(drag.topHz * (1 - fy)), m.alongTime ? fx * drag.spanSec : null);
  };

  // Up and down step the Beat (Shift: 1 Hz); left and right the time, half a minute.
  const stepKeys = (m: (typeof marks)[number], e: KeyboardEvent<HTMLSpanElement>) => {
    const hzStep = e.shiftKey ? 1 : 0.1;
    const halfMinute = 30 * moveScale(journey, durationSec);
    const step: Record<string, [number, number]> = {
      ArrowUp: [hzStep, 0],
      ArrowDown: [-hzStep, 0],
      ArrowRight: [0, halfMinute],
      ArrowLeft: [0, -halfMinute],
    };
    const [dHz, dSec] = step[e.key] ?? [0, 0];
    if (dHz === 0 && dSec === 0) return;
    e.preventDefault();
    moveMark(m.n, snapHz(m.hz + dHz), dSec !== 0 && m.alongTime ? m.sec + dSec : null);
  };

  // Hz on the left axis every 1, 2, 5, or 10 Hz, clear of the top edge.
  const hzStep = topHz <= 8 ? 1 : topHz <= 16 ? 2 : topHz <= 40 ? 5 : 10;
  const hzTicks = Array.from({ length: Math.floor(topHz / hzStep) + 1 }, (_, k) => k * hzStep).filter((hz) => y(hz) >= 7);

  // Time ticks at every point and at the end; one too close to the tick before drops.
  const tickSecs = [...new Set([...marks.map((m) => m.sec), ...(endSec === null ? [] : [holdEndSec]), spanSec])].sort(
    (a, b) => a - b,
  );
  const ticks = tickSecs.filter(
    (sec, i) =>
      i === 0 ||
      i === tickSecs.length - 1 ||
      (x(sec) - x(tickSecs[i - 1]) >= 9 && 100 - x(sec) >= 9),
  );

  // Stripes for the bands under the chart's top, high to low for the gradient.
  const bands = BAND_FLOORS.map((floor, i) => ({
    band: floor.band,
    from: floor.fromHz,
    to: Math.min(BAND_FLOORS[i + 1]?.fromHz ?? Infinity, topHz),
  }))
    .filter((b) => b.from < topHz)
    .reverse();

  const moves = journey.points.map((p, i) => {
    const move = `to ${p.hz} Hz over ${minutes(p.minutes * 60)} min (${EASING_META[p.easing].label})`;
    return i === journey.holdAt && endSec !== null && holdEndSec > hold.time
      ? `${move}, holding ${minutes(holdEndSec - hold.time)} min`
      : move;
  });
  const summary =
    endSec === null
      ? `Beat from ${journey.startHz} Hz, ${moves.slice(0, journey.holdAt + 1).join(", ")}, then holding until stopped.`
      : `Beat from ${journey.startHz} Hz, ${moves.join(", ")}, ending at ${minutes(endSec)} min.`;

  return (
    <figure className={`journey-chart${drag ? " is-dragging" : ""}`}>
      <div className="journey-axis" aria-hidden>
        <span className="journey-axis-unit">Hz</span>
        {bands.map((b) => (
          <span
            key={b.band}
            className="journey-axis-band"
            style={{ top: `${y(b.to)}%`, height: `${((b.to - b.from) / topHz) * 100}%`, color: BAND_COLORS[b.band] } as CSSProperties}
          >
            {(b.to - b.from) / topHz >= 0.09 && b.band}
          </span>
        ))}
        {hzTicks.map((hz) => (
          <span key={hz} className="journey-axis-hz" style={{ top: `${y(hz)}%` }}>
            {hz}
          </span>
        ))}
      </div>
      <div className="journey-plot" ref={plotRef} role="group" aria-label="Journey chart: drag a point, or use its arrow keys">
        {bands.map((b) => (
          <span
            key={b.band}
            className="journey-band"
            style={{ top: `${y(b.to)}%`, height: `${((b.to - b.from) / topHz) * 100}%`, "--band": BAND_COLORS[b.band] } as CSSProperties}
          />
        ))}
        {hzTicks.slice(1).map((hz) => (
          <span key={hz} className="journey-grid" style={{ top: `${y(hz)}%` }} />
        ))}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={summary}>
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
          {endSec === null && (
            <path
              d={`M ${x(hold.time)} ${y(hold.hz)} L 100 ${y(hold.hz)}`}
              className="journey-endless"
              stroke={BAND_COLORS[bandForHz(hold.hz)]}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {x(holdEndSec) - x(hold.time) >= 12 && (
          <span className="journey-phase" style={{ left: `${(x(hold.time) + x(holdEndSec)) / 2}%` }} aria-hidden>
            {endSec === null ? "Hold ∞" : "Hold"}
          </span>
        )}

        {live && (
          <span
            className="journey-now"
            style={{ left: `${x(live.elapsedSec)}%`, "--now": `${y(live.hz)}%`, "--band": BAND_COLORS[bandForHz(live.hz)] } as CSSProperties}
            aria-hidden
          />
        )}

        {marks.map((m, i) => (
          <span
            key={m.n}
            className={`journey-mark${m.alongTime ? " is-free" : ""}${m.n === drag?.n ? " is-dragged" : ""}${x(m.sec) < 6 ? " is-start" : x(m.sec) > 94 ? " is-end" : ""}${y(m.hz) < 24 ? " is-low-label" : ""}`}
            style={{ left: `${x(m.sec)}%`, top: `${y(m.hz)}%`, "--band": BAND_COLORS[bandForHz(m.hz)] } as CSSProperties}
            role="slider"
            tabIndex={0}
            aria-label={`${m.n === 1 ? "Start" : `Point ${m.n}`} on the chart`}
            aria-orientation="vertical"
            aria-valuemin={0.5}
            aria-valuemax={50}
            aria-valuenow={m.hz}
            aria-valuetext={`${m.hz} Hz at ${minutes(m.sec)} min`}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.focus();
              e.currentTarget.setPointerCapture(e.pointerId);
              setDrag({ n: m.n, topHz, spanSec });
            }}
            onPointerMove={(e) => {
              if (drag?.n === m.n) dragTo(m, e.clientX, e.clientY);
            }}
            onPointerUp={() => setDrag(null)}
            onPointerCancel={() => setDrag(null)}
            onKeyDown={(e) => stepKeys(m, e)}
          >
            <span aria-hidden>{m.n}</span>
            {labelled[i] && (
              <span className="journey-mark-label" aria-hidden>
                {m.hz} Hz{m.n === drag?.n && m.alongTime && ` · ${minutes(m.sec)} min`}
              </span>
            )}
          </span>
        ))}
      </div>
      <span className="journey-ticks-unit" aria-hidden>
        min
      </span>
      <div className="journey-ticks" aria-hidden>
        {ticks.map((sec, i) => (
          <span key={sec} style={{ left: `${x(sec)}%` }} className={i === 0 ? "is-first" : i === ticks.length - 1 ? "is-last" : ""}>
            {i === ticks.length - 1 && endSec === null ? "∞" : minutes(sec)}
          </span>
        ))}
      </div>
    </figure>
  );
}
