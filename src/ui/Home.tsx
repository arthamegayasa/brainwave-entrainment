import { useEffect, useReducer, useState } from "react";
import { PRESETS, DURATIONS_MIN, getPreset } from "../audio/presets";
import type { Preset } from "../audio/presets";
import { SOUND_LABELS } from "../audio/constants";
import type { AmbientKind } from "../audio/types";
import type { ListeningMode, SessionConfig } from "../audio/session";
import { BAND_COLORS, BAND_LABELS } from "./bands";
import { isUnlocked } from "../state/tier";
import { loadPrefs } from "../state/prefs";
import {
  dismissReciprocityCard,
  journeyPercent,
  journeySteps,
  loadProgress,
  recommendedPresetId,
  setChosenGoals,
  shouldShowReciprocity,
  skipGoalPicker,
  totalSessions,
} from "../state/progress";

const AMBIENTS: (AmbientKind | null)[] = [null, "rain", "ocean", "wind", "brown"];

interface HomeProps {
  onStart: (config: SessionConfig) => void;
  onUpgrade: () => void;
}

export function Home({ onStart, onUpgrade }: HomeProps) {
  const [selected, setSelected] = useState<Preset | null>(null);
  // First visit after Landing: the picker opens until answered OR skipped.
  const [pickerOpen, setPickerOpen] = useState(() => !loadProgress().goalPickerDone);
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const premiumUnlocked = isUnlocked("premiumPresets");

  const progress = loadProgress();
  // The recommendation must stay honest in a long-lived tab: a PWA opened in
  // the morning and reopened at night may never remount Home, so re-evaluate
  // the time-of-day window every minute and whenever the tab becomes visible.
  const [recoId, setRecoId] = useState(() => recommendedPresetId());
  useEffect(() => {
    const update = () => setRecoId(recommendedPresetId());
    const timer = window.setInterval(update, 60_000);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  const recommended = getPreset(recoId);
  const steps = journeySteps();
  const percent = journeyPercent();

  // Smart default (D-05): one tap starts the recommended session with the
  // user's last-used settings — no sheet, no decisions. Resolve the preset
  // again at click time so a stale render can't start yesterday's window.
  const startRecommended = () => {
    const preset = getPreset(recommendedPresetId());
    const prefs = loadPrefs();
    onStart({
      preset,
      durationMin: prefs.lastDurationMin === "inf" ? null : prefs.lastDurationMin ?? 30,
      mode: prefs.lastMode,
      ambient: preset.defaultAmbient,
      solfeggioTone: null,
    });
  };

  // IKEA effect (D-05): chosen goals come first, in the order they were picked.
  const chosen = progress.chosenGoals;
  const orderedPresets = [
    ...chosen
      .map((id) => PRESETS.find((p) => p.id === id))
      .filter((p): p is Preset => p !== undefined),
    ...PRESETS.filter((p) => !chosen.includes(p.id)),
  ];

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

      <section
        className="reco-card"
        style={{ "--card-accent": BAND_COLORS[recommended.band] } as React.CSSProperties}
        aria-label="Recommended now"
      >
        <div className="reco-info">
          <span className="reco-label">Recommended now</span>
          <h2>
            <span className="emoji" aria-hidden>
              {recommended.emoji}
            </span>{" "}
            {recommended.name}
          </h2>
          <p className="tagline">{recommended.tagline}</p>
        </div>
        <div className="reco-actions">
          <button className="start-btn compact" onClick={startRecommended}>
            Start now
          </button>
          <button className="pill-btn" onClick={() => setSelected(recommended)}>
            Adjust
          </button>
        </div>
      </section>

      <section className="journey" aria-label="Your journey">
        <div className="journey-bar">
          <div className="journey-fill" style={{ width: `${percent}%` }} />
        </div>
        <div className="journey-steps">
          {steps.map((step, i) =>
            i === 1 ? (
              <button
                key={step.label}
                className={`journey-step clickable ${step.done ? "done" : ""}`}
                onClick={() => setPickerOpen(true)}
              >
                {step.done ? "✓ " : ""}
                {step.label}
              </button>
            ) : (
              <span key={step.label} className={`journey-step ${step.done ? "done" : ""}`}>
                {step.done ? "✓ " : ""}
                {step.label}
              </span>
            ),
          )}
        </div>
      </section>

      {shouldShowReciprocity() && (
        <section className="reciprocity-card" aria-label="Your progress">
          <button
            className="reciprocity-dismiss"
            aria-label="Dismiss"
            onClick={() => {
              dismissReciprocityCard();
              refresh();
            }}
          >
            ✕
          </button>
          <p>
            You've completed {totalSessions()} sessions — nice rhythm. Create a
            free account to save your progress, or go Premium to keep every
            feature.
          </p>
          <button className="pill-btn" onClick={onUpgrade}>
            Explore Premium
          </button>
        </section>
      )}

      <section className="preset-grid" aria-label="Session goals">
        {orderedPresets.map((preset, i) => (
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

      {pickerOpen && (
        <GoalPicker
          initial={progress.chosenGoals}
          onChoose={(ids) => {
            setChosenGoals(ids);
            setPickerOpen(false);
            refresh();
          }}
          onSkip={() => {
            skipGoalPicker();
            setPickerOpen(false);
            refresh();
          }}
        />
      )}
    </>
  );
}

interface GoalPickerProps {
  initial: string[];
  onChoose: (ids: string[]) => void;
  onSkip: () => void;
}

/** IKEA-effect goal picker (D-05): multi-select of the 8 goals, skippable. */
function GoalPicker({ initial, onChoose, onSkip }: GoalPickerProps) {
  const [selection, setSelection] = useState<string[]>(initial);

  const toggle = (id: string) =>
    setSelection((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  return (
    <div className="sheet-backdrop">
      <div
        className="sheet goal-picker"
        role="dialog"
        aria-modal="true"
        aria-label="Pick your goals"
      >
        <h2>What do you want more of?</h2>
        <p className="tagline">
          Pick the goals that matter to you — we'll put them first.
        </p>
        <div className="goal-chips">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              className={`chip goal-chip ${selection.includes(preset.id) ? "selected" : ""}`}
              onClick={() => toggle(preset.id)}
            >
              <span aria-hidden>{preset.emoji}</span> {preset.name}
            </button>
          ))}
        </div>
        <button
          className="start-btn compact"
          disabled={selection.length === 0}
          onClick={() => onChoose(selection)}
        >
          Continue
        </button>
        <button className="close-btn" onClick={onSkip}>
          Skip for now
        </button>
      </div>
    </div>
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
