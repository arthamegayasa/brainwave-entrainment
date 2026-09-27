import { useId, useState } from "react";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { BAND_COLORS, BAND_LABELS, bandForHz } from "./bands";

/** Slider travel in positions; the value is derived, so a log scale gets the same travel. */
const TRAVEL = 1000;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/** Round to the field's step without float dust (0.1 + 0.2 stays 0.3). */
function snap(v: number, step: number): number {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  return Number((Math.round(v / step) * step).toFixed(decimals));
}

function toPosition(v: number, min: number, max: number, log: boolean): number {
  const c = clamp(Number.isFinite(v) ? v : min, min, max);
  const f = log ? Math.log(c / min) / Math.log(max / min) : (c - min) / (max - min);
  return Math.round(f * TRAVEL);
}

function fromPosition(p: number, min: number, max: number, log: boolean): number {
  const f = p / TRAVEL;
  return log ? min * (max / min) ** f : min + (max - min) * f;
}

interface RangeFieldProps {
  label: string;
  /** Accessible name when the visible label leans on its surroundings ("Beat" under "Start"). */
  name?: string;
  value: number;
  min: number;
  max: number;
  /** Precision of slid values and of one arrow-key step. */
  step: number;
  /** Precision the typed value may carry; defaults to `step`. */
  inputStep?: number;
  unit: string;
  /** Logarithmic travel: 1–10 Hz gets as much of the slider as 10–50 Hz. */
  log?: boolean;
  /** Show the value as text instead of a number box. */
  readOnlyValue?: boolean;
  /** Content beside the label, such as a band chip. */
  aside?: ReactNode;
  /** Slider colour; the accent when omitted. */
  tone?: string;
  onChange: (value: number) => void;
}

/**
 * A number with a slider under it: slide for a feel, type for precision.
 * Typed values commit while they are in range and are clamped on blur, so a
 * half-typed "1" on the way to "120" never reaches the audio.
 */
export function RangeField({
  label,
  name = label,
  value,
  min,
  max,
  step,
  inputStep = step,
  unit,
  log = false,
  readOnlyValue = false,
  aside,
  tone,
  onChange,
}: RangeFieldProps) {
  const id = useId();
  /** The text being typed; null while the box is not being edited. */
  const [draft, setDraft] = useState<string | null>(null);
  const position = toPosition(value, min, max, log);

  const commitTyped = (text: string, final: boolean) => {
    const n = Number(text);
    if (text.trim() === "" || !Number.isFinite(n)) return;
    if (final) onChange(clamp(n, min, max));
    else if (n >= min && n <= max) onChange(n);
  };

  // Arrow keys step through values, not slider positions: on a log scale one
  // position near the bottom is smaller than the rounding step.
  const stepKeys = (e: KeyboardEvent<HTMLInputElement>) => {
    const dir =
      e.key === "ArrowUp" || e.key === "ArrowRight" ? 1
      : e.key === "ArrowDown" || e.key === "ArrowLeft" ? -1
      : e.key === "PageUp" ? 10
      : e.key === "PageDown" ? -10
      : 0;
    if (dir === 0) return;
    e.preventDefault();
    onChange(clamp(snap(value + dir * step, step), min, max));
  };

  return (
    <div className="rf" style={tone ? ({ "--accent": tone } as CSSProperties) : undefined}>
      <div className="rf-head">
        <label className="rf-label" htmlFor={`${id}-n`}>
          {label}
        </label>
        {aside}
        <span className="rf-value">
          {readOnlyValue ? (
            <output id={`${id}-n`} className="rf-readout">
              {value}
            </output>
          ) : (
            <input
              id={`${id}-n`}
              className="rf-number"
              type="number"
              inputMode="decimal"
              min={min}
              max={max}
              step={inputStep}
              aria-label={`${name} (${unit})`}
              value={draft ?? String(value)}
              onFocus={() => setDraft(String(value))}
              onChange={(e) => {
                setDraft(e.target.value);
                commitTyped(e.target.value, false);
              }}
              onBlur={() => {
                if (draft !== null) commitTyped(draft, true);
                setDraft(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
          )}
          <span className="rf-unit" aria-hidden>
            {unit}
          </span>
        </span>
      </div>
      <input
        type="range"
        className="rf-slider"
        min={0}
        max={TRAVEL}
        step={1}
        value={position}
        aria-label={name}
        aria-valuetext={`${value} ${unit}`}
        style={{ "--fill": `${(position / TRAVEL) * 100}%` } as CSSProperties}
        onKeyDown={stepKeys}
        onChange={(e) =>
          onChange(clamp(snap(fromPosition(Number(e.target.value), min, max, log), step), min, max))
        }
      />
    </div>
  );
}

/** Capitalised band name, e.g. "Theta". */
export function bandName(hz: number): string {
  const band = bandForHz(hz);
  return band[0].toUpperCase() + band.slice(1);
}

/** The band a Beat falls in, in its colour; `full` adds what the band is known for. */
export function BandChip({ hz, full = false }: { hz: number; full?: boolean }) {
  const band = bandForHz(hz);
  return (
    <span className="band-chip" style={{ "--band": BAND_COLORS[band] } as CSSProperties}>
      {full ? BAND_LABELS[band] : bandName(hz)}
    </span>
  );
}

