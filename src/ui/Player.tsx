import { SOUND_LABELS } from "../audio/constants";
import type { AmbientKind } from "../audio/types";
import type { SessionApi } from "./useSession";
import type { SessionVolumes } from "../audio/session";
import { BAND_COLORS, formatClock } from "./bands";
import { SessionViz } from "./SessionViz";
import { SceneArt } from "./SceneArt";
import { sessionsThisWeek, weeklyStreakDots } from "../state/progress";

const AMBIENTS: (AmbientKind | null)[] = [null, "rain", "ocean", "wind", "brown"];

const PHASE_LABELS: Record<string, string> = {
  rampIn: "Easing down…",
  hold: "Holding at target frequency",
  rampOut: "Rising back gently…",
  done: "Session complete",
};

const MIXER_CHANNELS: Array<{ key: keyof SessionVolumes; label: string }> = [
  { key: "master", label: "Master volume" },
  { key: "entrainment", label: "Entrainment" },
  { key: "ambient", label: "Ambient" },
];

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

interface SessionCompleteProps {
  presetName: string;
  onDone: () => void;
}

/**
 * Post-session completion card (goal gradient + loss aversion): weekly
 * session count, Mon-Sun streak dots, and the come-back-tomorrow nudge.
 */
export function SessionComplete({ presetName, onDone }: SessionCompleteProps) {
  const count = sessionsThisWeek();
  const dots = weeklyStreakDots();

  return (
    <section className="session-complete">
      <div className="complete-card">
        <SceneArt sceneId="complete" variant="complete" />
        <h2>{presetName} complete</h2>
        <p className="complete-count">Session #{count} this week</p>
        <div className="streak-dots" aria-label="Sessions this week, Monday to Sunday">
          {dots.map((filled, i) => (
            <span className="streak-day" key={`${DAY_LABELS[i]}-${i}`}>
              <span className={`streak-dot ${filled ? "filled" : ""}`} aria-hidden />
              <span className="streak-label">{DAY_LABELS[i]}</span>
            </span>
          ))}
        </div>
        <p className="complete-note">Come back tomorrow to keep your streak.</p>
        <button className="start-btn compact" onClick={onDone}>
          Back to sessions
        </button>
      </div>
    </section>
  );
}

interface PlayerProps {
  session: SessionApi;
  onExit: () => void;
}

export function Player({ session, onExit }: PlayerProps) {
  const { preset, config, progress, volumes, paused } = session.state;
  if (!preset || !config) return null;

  const accent = BAND_COLORS[preset.band];
  const timer =
    progress.remainingSec === null
      ? formatClock(progress.elapsedSec)
      : formatClock(progress.remainingSec);
  // How far the beat has travelled from its start toward the target, straight
  // from the engine: the scene deepens while descending presets ease down and
  // warms while ascending ones lift, and returns as a closing ramp rises back.
  const journey = Math.min(1, Math.max(0,
    (progress.currentBeatHz - preset.startHz) / (preset.targetHz - preset.startHz)));
  const descending = preset.targetHz < preset.startHz;
  // Only this overlay's opacity changes per tick; the scene below never re-styles.
  const shadeStyle = {
    background: descending ? "#040912" : "#ffcf9c",
    opacity: (journey * (descending ? 0.45 : 0.18)).toFixed(2),
  };

  return (
    <section
      className={paused ? "player paused" : "player"}
      style={{ "--accent": accent } as React.CSSProperties}
    >
      <h2 className="session-name">
        {preset.emoji} {preset.name}
      </h2>

      <div className="player-stage" data-parallax>
        <SceneArt sceneId={preset.id} variant="player" />
        <span className="scene-shade" style={shadeStyle} />
        <div className="orb-wrap" aria-hidden>
          <div className="orb-halo" />
          <div className="orb" />
          <div className="orb-ring" />
          <div className="timer">{timer}</div>
        </div>
      </div>

      <div className="phase-label">
        {progress.remainingSec === null ? "Infinite session · " : ""}
        {paused ? "Paused" : PHASE_LABELS[progress.phase]}
      </div>

      <SessionViz
        schedule={session.getSchedule()}
        elapsedSec={progress.elapsedSec}
        durationSec={config.durationMin === null ? null : config.durationMin * 60}
      />

      <div className="player-controls">
        {paused ? (
          <button className="pill-btn" onClick={session.resume}>
            ▶ Resume
          </button>
        ) : (
          <button className="pill-btn" onClick={session.pause}>
            ❚❚ Pause
          </button>
        )}
        <button className="pill-btn stop" onClick={onExit}>
          ■ End Session
        </button>
      </div>

      <div className="player-panels">
        <details className="panel" open>
          <summary>Ambient</summary>
          <div className="panel-body">
            <div className="chips">
              {AMBIENTS.map((a) => (
                <button
                  key={a ?? "none"}
                  className={`chip ${config.ambient === a ? "selected" : ""}`}
                  onClick={() => session.setAmbient(a)}
                >
                  {a === null ? "No ambient" : SOUND_LABELS[a]}
                </button>
              ))}
            </div>
          </div>
        </details>

        <details className="panel">
          <summary>Volume mixer</summary>
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
          <summary>Frequency details</summary>
          <div className="panel-body">
            <div className="freq-grid">
              <div className="freq-item">
                <div className="k">Current beat</div>
                <div className="v">{progress.currentBeatHz.toFixed(2)} Hz</div>
              </div>
              <div className="freq-item">
                <div className="k">Carrier (solfeggio)</div>
                <div className="v">{progress.carrierHz} Hz</div>
              </div>
              <div className="freq-item">
                <div className="k">Method</div>
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
          🎧 Use headphones — the binaural effect needs both ears
        </p>
      )}
    </section>
  );
}
