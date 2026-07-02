import { SOUND_LABELS_ID } from "../audio/constants";
import type { AmbientKind } from "../audio/types";
import type { SessionApi } from "./useSession";
import type { SessionVolumes } from "../audio/session";
import { BAND_COLORS, formatClock } from "./bands";

const AMBIENTS: (AmbientKind | null)[] = [null, "rain", "ocean", "wind", "brown"];

const PHASE_LABELS: Record<string, string> = {
  rampIn: "Menurun perlahan…",
  hold: "Berada di frekuensi tujuan",
  rampOut: "Kembali naik perlahan…",
  done: "Sesi selesai",
};

const MIXER_CHANNELS: Array<{ key: keyof SessionVolumes; label: string }> = [
  { key: "master", label: "Volume utama" },
  { key: "entrainment", label: "Gelombang" },
  { key: "ambient", label: "Suasana latar" },
];

interface PlayerProps {
  session: SessionApi;
  onExit: () => void;
}

export function Player({ session, onExit }: PlayerProps) {
  const { preset, config, progress, volumes } = session.state;
  if (!preset || !config) return null;

  const accent = BAND_COLORS[preset.band];
  const timer =
    progress.remainingSec === null
      ? formatClock(progress.elapsedSec)
      : formatClock(progress.remainingSec);

  return (
    <section
      className="player"
      style={{ "--accent": accent } as React.CSSProperties}
    >
      <h2 className="session-name">
        {preset.emoji} {preset.name}
      </h2>

      <div className="orb-wrap" aria-hidden>
        <div className="orb-halo" />
        <div className="orb" />
        <div className="orb-ring" />
        <div className="timer">{timer}</div>
      </div>

      <div className="phase-label">
        {progress.remainingSec === null ? "Sesi tanpa batas · " : ""}
        {PHASE_LABELS[progress.phase]}
      </div>

      <div className="player-controls">
        <button className="pill-btn stop" onClick={onExit}>
          ■ Akhiri Sesi
        </button>
      </div>

      <div className="player-panels">
        <details className="panel" open>
          <summary>Suasana latar</summary>
          <div className="panel-body">
            <div className="chips">
              {AMBIENTS.map((a) => (
                <button
                  key={a ?? "none"}
                  className={`chip ${config.ambient === a ? "selected" : ""}`}
                  onClick={() => session.setAmbient(a)}
                >
                  {a === null ? "Tanpa latar" : SOUND_LABELS_ID[a]}
                </button>
              ))}
            </div>
          </div>
        </details>

        <details className="panel">
          <summary>Mixer volume</summary>
          <div className="panel-body">
            {MIXER_CHANNELS.map(({ key, label }) => (
              <label className="mixer-row" key={key}>
                <span>{label}</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volumes[key]}
                  style={{ "--fill": `${volumes[key] * 100}%` } as React.CSSProperties}
                  onChange={(e) => session.setVolume(key, Number(e.target.value))}
                />
                <span className="value">{Math.round(volumes[key] * 100)}%</span>
              </label>
            ))}
          </div>
        </details>

        <details className="panel">
          <summary>Detail frekuensi</summary>
          <div className="panel-body">
            <div className="freq-grid">
              <div className="freq-item">
                <div className="k">Beat saat ini</div>
                <div className="v">{progress.currentBeatHz.toFixed(2)} Hz</div>
              </div>
              <div className="freq-item">
                <div className="k">Carrier (solfeggio)</div>
                <div className="v">{progress.carrierHz} Hz</div>
              </div>
              <div className="freq-item">
                <div className="k">Metode</div>
                <div className="v" style={{ fontSize: "0.95rem", paddingTop: "0.3rem" }}>
                  {config.mode === "headphone" ? "Binaural" : "Isochronic"}
                </div>
              </div>
            </div>
          </div>
        </details>
      </div>

      {config.mode === "headphone" && (
        <p className="headphone-note">
          🎧 Gunakan headphone — efek binaural membutuhkan kedua telinga
        </p>
      )}
    </section>
  );
}
