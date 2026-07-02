import { useState } from "react";
import { PRESETS, DURATIONS_MIN } from "../audio/presets";
import type { Preset } from "../audio/presets";
import { SOUND_LABELS } from "../audio/constants";
import type { AmbientKind } from "../audio/types";
import type { ListeningMode, SessionConfig } from "../audio/session";
import { BAND_COLORS, BAND_LABELS } from "./bands";
import { isUnlocked } from "../state/tier";
import { loadPrefs } from "../state/prefs";

const AMBIENTS: (AmbientKind | null)[] = [null, "rain", "ocean", "wind", "brown"];

interface HomeProps {
  onStart: (config: SessionConfig) => void;
}

export function Home({ onStart }: HomeProps) {
  const [selected, setSelected] = useState<Preset | null>(null);
  const premiumUnlocked = isUnlocked("premiumPresets");

  return (
    <>
      <section className="hero">
        <h1>
          Choose your goal, <em>let the sound do the work</em>
        </h1>
        <p>
          Guided audio sessions — binaural beats, isochronic tones, solfeggio,
          and natural ambience — that ease your brainwaves down step by step.
          No need to understand a single number.
        </p>
      </section>

      <section className="preset-grid" aria-label="Session goals">
        {PRESETS.map((preset, i) => (
          <button
            key={preset.id}
            className="preset-card"
            style={{ "--card-accent": BAND_COLORS[preset.band], "--i": i } as React.CSSProperties}
            onClick={() => setSelected(preset)}
          >
            <span className="emoji" aria-hidden>
              {preset.emoji}
            </span>
            {preset.premium && (
              <span className="premium-tag">
                {premiumUnlocked ? "Premium" : "🔒 Premium"}
              </span>
            )}
            <h3>{preset.name}</h3>
            <p className="tagline">{preset.tagline}</p>
            <span className="band-chip">{BAND_LABELS[preset.band]}</span>
          </button>
        ))}
      </section>

      {selected && (
        <SetupSheet
          preset={selected}
          onClose={() => setSelected(null)}
          onStart={(config) => {
            setSelected(null);
            onStart(config);
          }}
        />
      )}
    </>
  );
}

interface SetupSheetProps {
  preset: Preset;
  onClose: () => void;
  onStart: (config: SessionConfig) => void;
}

function SetupSheet({ preset, onClose, onStart }: SetupSheetProps) {
  const prefs = loadPrefs();
  const [durationMin, setDurationMin] = useState<number | null>(
    prefs.lastDurationMin === "inf" ? null : prefs.lastDurationMin ?? 30,
  );
  const [mode, setMode] = useState<ListeningMode>(prefs.lastMode);
  const [ambient, setAmbient] = useState<AmbientKind | null>(preset.defaultAmbient);

  const accent = BAND_COLORS[preset.band];

  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Set up the ${preset.name} session`}
        style={{ "--accent": accent } as React.CSSProperties}
      >
        <div className="sheet-head">
          <span className="emoji" aria-hidden>
            {preset.emoji}
          </span>
          <div>
            <h2>{preset.name}</h2>
            <p className="tagline">{preset.tagline}</p>
          </div>
        </div>

        <div className="field">
          <div className="label">Duration</div>
          <div className="chips">
            {DURATIONS_MIN.map((d) => (
              <button
                key={d ?? "inf"}
                className={`chip ${durationMin === d ? "selected" : ""}`}
                onClick={() => setDurationMin(d)}
              >
                {d === null ? "∞" : `${d} min`}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <div className="label">How to listen</div>
          <div className="mode-cards">
            <button
              className={`mode-card ${mode === "headphone" ? "selected" : ""}`}
              onClick={() => setMode("headphone")}
            >
              <div className="mode-name">🎧 Headphones</div>
              <div className="mode-desc">
                Binaural beats — two slightly different tones per ear. The
                deepest effect; headphones required.
              </div>
            </button>
            <button
              className={`mode-card ${mode === "speaker" ? "selected" : ""}`}
              onClick={() => setMode("speaker")}
            >
              <div className="mode-name">🔊 Speaker</div>
              <div className="mode-desc">
                Isochronic tones — gentle pulses that work without headphones.
              </div>
            </button>
          </div>
        </div>

        <div className="field">
          <div className="label">Ambient</div>
          <div className="chips">
            {AMBIENTS.map((a) => (
              <button
                key={a ?? "none"}
                className={`chip ${ambient === a ? "selected" : ""}`}
                onClick={() => setAmbient(a)}
              >
                {a === null ? "No ambient" : SOUND_LABELS[a]}
              </button>
            ))}
          </div>
        </div>

        <button
          className="start-btn"
          onClick={() =>
            onStart({ preset, durationMin, mode, ambient, solfeggioTone: null })
          }
        >
          Start Session
        </button>
        <button className="close-btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
