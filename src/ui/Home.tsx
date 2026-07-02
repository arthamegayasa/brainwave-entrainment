import { useState } from "react";
import { PRESETS, DURATIONS_MIN } from "../audio/presets";
import type { Preset } from "../audio/presets";
import { SOUND_LABELS_ID } from "../audio/constants";
import type { AmbientKind } from "../audio/types";
import type { ListeningMode, SessionConfig } from "../audio/session";
import { BAND_COLORS, BAND_LABELS_ID } from "./bands";
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
          Pilih tujuanmu, <em>biarkan suaranya bekerja</em>
        </h1>
        <p>
          Sesi audio terpandu — binaural beats, isochronic tones, solfeggio, dan
          ambient alami — yang menuntun gelombang otakmu secara bertahap. Tanpa
          perlu paham satu angka pun.
        </p>
      </section>

      <section className="preset-grid" aria-label="Pilihan tujuan sesi">
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
            <span className="band-chip">{BAND_LABELS_ID[preset.band]}</span>
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
        aria-label={`Atur sesi ${preset.name}`}
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
          <div className="label">Durasi</div>
          <div className="chips">
            {DURATIONS_MIN.map((d) => (
              <button
                key={d ?? "inf"}
                className={`chip ${durationMin === d ? "selected" : ""}`}
                onClick={() => setDurationMin(d)}
              >
                {d === null ? "∞" : `${d} mnt`}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <div className="label">Cara mendengarkan</div>
          <div className="mode-cards">
            <button
              className={`mode-card ${mode === "headphone" ? "selected" : ""}`}
              onClick={() => setMode("headphone")}
            >
              <div className="mode-name">🎧 Headphone</div>
              <div className="mode-desc">
                Binaural beats — dua nada berbeda di tiap telinga. Efek paling
                dalam, wajib headphone.
              </div>
            </button>
            <button
              className={`mode-card ${mode === "speaker" ? "selected" : ""}`}
              onClick={() => setMode("speaker")}
            >
              <div className="mode-name">🔊 Speaker</div>
              <div className="mode-desc">
                Isochronic tones — denyut halus yang bekerja tanpa headphone.
              </div>
            </button>
          </div>
        </div>

        <div className="field">
          <div className="label">Suasana latar</div>
          <div className="chips">
            {AMBIENTS.map((a) => (
              <button
                key={a ?? "none"}
                className={`chip ${ambient === a ? "selected" : ""}`}
                onClick={() => setAmbient(a)}
              >
                {a === null ? "Tanpa latar" : SOUND_LABELS_ID[a]}
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
          Mulai Sesi
        </button>
        <button className="close-btn" onClick={onClose}>
          Batal
        </button>
      </div>
    </div>
  );
}
