import { useId } from "react";
import { DURATIONS_MIN } from "../audio/presets";

interface DurationRowProps {
  /** Minutes; null = ∞. */
  value: number | null;
  onChange: (durationMin: number | null) => void;
}

/** The length of a Play as one segmented row: 15 · 30 · 45 · 60 · ∞. */
export function DurationRow({ value, onChange }: DurationRowProps) {
  const labelId = useId();
  return (
    <div className="field" role="group" aria-labelledby={labelId}>
      <div className="label" id={labelId}>
        Duration (min)
      </div>
      <div className="segmented">
        {DURATIONS_MIN.map((d) => (
          <button
            key={d ?? "inf"}
            className={value === d ? "selected" : ""}
            aria-label={d === null ? undefined : `${d} min`}
            aria-pressed={value === d}
            onClick={() => onChange(d)}
          >
            {d ?? "∞"}
          </button>
        ))}
      </div>
    </div>
  );
}
