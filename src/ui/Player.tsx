import { useEffect, useRef, useState } from "react";
import { SOUND_LABELS } from "../audio/constants";
import type { EntrainmentLayerType } from "../audio/builder";
import type { SessionApi } from "./useSession";
import type { SessionVolumes } from "../audio/session";
import { BAND_COLORS, formatClock } from "./bands";
import { SessionViz } from "./SessionViz";
import { SceneArt } from "./SceneArt";
import { pauseAudio, resumeAudio } from "./audioContext";
import { stopPlay, useNowPlaying, usePlayProgress } from "./nowPlaying";
import { useBackLayer } from "./backNavigation";
import { AMBIENTS, ambientLabel } from "./ambients";
import { sessionsThisWeek, weeklyStreakDots } from "../state/progress";

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
  /** The completed Preset or Custom Audio. */
  name: string;
  /** The button back to where the Play was chosen. */
  doneLabel: string;
  onDone: () => void;
}

/**
 * Post-session completion card (goal gradient + loss aversion): weekly
 * session count, Mon-Sun streak dots, and the come-back-tomorrow nudge.
 */
export function SessionComplete({ name, doneLabel, onDone }: SessionCompleteProps) {
  const count = sessionsThisWeek();
  const dots = weeklyStreakDots();

  return (
    <section className="session-complete">
      <div className="complete-card">
        <SceneArt sceneId="complete" variant="complete" />
        <h2>{name} complete</h2>
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
          {doneLabel}
        </button>
      </div>
    </section>
  );
}

type PlayerSheet = "ambient" | "mixer" | "frequencies" | null;

const SHEET_TITLES: Record<Exclude<PlayerSheet, null>, string> = {
  ambient: "Ambient",
  mixer: "Mixer",
  frequencies: "Frequency details",
};

function FrequencyValue({ label, hz }: { label: string; hz: number }) {
  return (
    <div className="freq-item">
      <div className="k">{label}</div>
      <div className="v">{hz.toFixed(2)} Hz</div>
    </div>
  );
}

interface BeatValuesProps {
  /** How the Beat reaches the ears: a Preset's Headphones mode is binaural, its Speaker mode isochronic. */
  type: EntrainmentLayerType;
  carrierHz: number;
  beatHz: number;
}

/** The frequencies actually sounding for a Beat on a Carrier: per ear, per tone, or tone and pulse. */
function BeatValues({ type, carrierHz, beatHz }: BeatValuesProps) {
  if (type === "isochronic") {
    return (
      <>
        <FrequencyValue label="Tone · Carrier" hz={carrierHz} />
        <FrequencyValue label="Pulse · Beat" hz={beatHz} />
      </>
    );
  }
  // Binaural splits the two tones between the ears; monaural sums them in both.
  const [first, second] = type === "binaural" ? ["Left", "Right"] : ["Tone 1", "Tone 2"];
  return (
    <>
      <FrequencyValue label={`${first} · Carrier`} hz={carrierHz} />
      <FrequencyValue label={`${second} · Carrier + Beat`} hz={carrierHz + beatHz} />
      <FrequencyValue label="Beat" hz={beatHz} />
    </>
  );
}

interface PlayToggleProps {
  className: string;
  /** The User paused the running Play. */
  paused: boolean;
  /** The device holds the audio until a tap. */
  held: boolean;
}

/** Pause/Play for the running Play in the Player and the Mini-player; it pulses "Tap to resume" while the device holds the audio. */
export function PlayToggle({ className, paused, held }: PlayToggleProps) {
  return (
    <button className={`${className}${held ? " player-held" : ""}`}
      aria-label={held ? "Tap to resume" : paused ? "Resume Play" : "Pause Play"}
      onClick={paused || held ? resumeAudio : pauseAudio}>
      <span aria-hidden>{paused || held ? "▶" : "❚❚"}</span>
      {held && <small>Tap to resume</small>}
    </button>
  );
}

interface PlayerProps {
  /** A running Preset Play's ambient and mixer; Custom Audio has neither. */
  session: SessionApi;
  /** ⌄: shrink into the Mini-player; the Play keeps playing. */
  onMinimize: () => void;
}

/** The running Play, Preset or Custom Audio, as Now Playing shows it. */
export function Player({ session, onMinimize }: PlayerProps) {
  const play = useNowPlaying();
  const progress = usePlayProgress();
  const [sheet, setSheet] = useState<PlayerSheet>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [keepScreenOn, setKeepScreenOn] = useState(false);
  const [wakeError, setWakeError] = useState(false);
  const [visible, setVisible] = useState(() => document.visibilityState === "visible");
  const [controlsVisible, setControlsVisible] = useState(true);
  const [activity, setActivity] = useState(0);
  const paused = play?.paused ?? false;
  const held = play?.held ?? false;
  // Back closes the open sheet before it minimizes the Player.
  useBackLayer(sheet !== null, () => setSheet(null));

  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    if (!keepScreenOn || paused || held || !visible) return;
    if (!navigator.wakeLock) {
      setWakeError(true);
      return;
    }
    let cancelled = false;
    let lock: WakeLockSentinel | null = null;
    void navigator.wakeLock.request("screen").then((sentinel) => {
      if (cancelled) void sentinel.release();
      else lock = sentinel;
    }).catch(() => {
      if (!cancelled) setWakeError(true);
    });
    return () => {
      cancelled = true;
      if (lock) void lock.release();
    };
  }, [keepScreenOn, paused, held, visible]);

  useEffect(() => {
    setControlsVisible(true);
    if (paused || held || menuOpen || sheet) return;
    const timer = window.setTimeout(() => setControlsVisible(false), 6000);
    return () => window.clearTimeout(timer);
  }, [paused, held, menuOpen, sheet, activity]);

  useEffect(() => {
    if (!sheet && !menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSheet(null);
        setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [sheet, menuOpen]);

  if (!play || !progress) return null;
  const { audio, frequencies, schedule } = play;
  const { ambient, volumes } = session;
  // Studio-designed audio (Custom Audio, or a saved session) has its ambient
  // and mix fixed by its designer, and one Carrier per entrainment layer.
  const custom = "layers" in frequencies;
  const binaural = custom
    ? frequencies.layers.some((layer) => layer.type === "binaural")
    : frequencies.mode === "headphone";
  const reveal = () => {
    setControlsVisible(true);
    setActivity((n) => n + 1);
  };
  const accent = audio.band ? BAND_COLORS[audio.band] : undefined;
  const timer =
    progress.remainingSec === null
      ? formatClock(progress.elapsedSec)
      : formatClock(progress.remainingSec);
  // Only this overlay's opacity changes per tick; the Scene below never re-styles.
  const [{ hz: startHz }, { hz: targetHz }] = schedule.points;
  const journey = Math.min(1, Math.max(0, (progress.beatHz - startHz) / (targetHz - startHz)));
  const descending = targetHz < startHz;
  const shadeStyle = {
    background: descending ? "#040912" : "#ffcf9c",
    opacity: (journey * (descending ? 0.45 : 0.18)).toFixed(2),
  };

  return (
    <section
      className={`player${paused ? " paused" : ""}${controlsVisible ? "" : " controls-dimmed"}`}
      style={{ "--accent": accent } as React.CSSProperties}
      onPointerDown={(event) => {
        reveal();
        if (menuOpen && !menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
      }}
      onFocus={reveal}
      onKeyDown={reveal}
    >
      <header className="player-header player-fading">
        <button className="player-icon player-minimize" aria-label="Minimize Player" onClick={onMinimize}>⌄</button>
        <h2 className="session-name">{audio.emoji ? `${audio.emoji} ${audio.name}` : audio.name}</h2>
        <div className="player-menu-wrap" ref={menuRef}>
          <button className="player-icon" aria-label="More options" aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}>⋯</button>
          {menuOpen && (
            <div className="player-menu" role="menu" aria-label="Player options">
              <button role="menuitemcheckbox" aria-checked={keepScreenOn}
                onClick={() => {
                  setWakeError(false);
                  setKeepScreenOn((on) => !on);
                  setMenuOpen(false);
                }}>
                Keep screen on {keepScreenOn ? "✓" : ""}
              </button>
              {wakeError && <p role="status">Screen Wake Lock unavailable on this device.</p>}
              <button role="menuitem" className="end-play" onClick={stopPlay}>End session</button>
            </div>
          )}
        </div>
      </header>

      <div className="player-stage" data-parallax>
        <SceneArt sceneId={play.scene} variant="player" />
        <span className="scene-shade" style={shadeStyle} />
        <div className="orb-wrap" aria-hidden>
          <div className="orb-halo" />
          <div className="orb" />
          <div className="orb-ring" />
          <div className="timer">{timer}</div>
        </div>
      </div>

      <div className="phase-label player-fading">
        {progress.remainingSec === null ? "Infinite Play · " : ""}
        {paused ? "Paused" : held ? "Audio held by device" : PHASE_LABELS[progress.phase]}
      </div>

      <div className="player-curve player-fading">
        <SessionViz schedule={schedule} elapsedSec={progress.elapsedSec} durationSec={schedule.endSec} />
      </div>

      <div className="player-controls player-fading">
        {!custom && <button className="player-icon" aria-label="Ambient" onClick={() => setSheet("ambient")}>♫</button>}
        <PlayToggle className="player-play" paused={paused} held={held} />
        {!custom && <button className="player-icon" aria-label="Mixer" onClick={() => setSheet("mixer")}>☷</button>}
      </div>
      <button className="player-mode player-fading" onClick={() => setSheet("frequencies")}>
        {binaural ? "🎧 Headphones" : "◉ Speaker"}
        <span> · Frequency details</span>
      </button>

      {sheet && (
        <div className="sheet-backdrop" onClick={(event) => {
          if (event.target === event.currentTarget) setSheet(null);
        }}>
          <div className="sheet player-sheet" role="dialog" aria-modal="true"
            aria-label={SHEET_TITLES[sheet]}>
            <div className="sheet-head">
              <h2>{SHEET_TITLES[sheet]}</h2>
              <button className="player-icon" aria-label="Close" onClick={() => setSheet(null)}>✕</button>
            </div>
            {sheet === "ambient" && (
              <div className="chips">
                {AMBIENTS.map(({ kind }) => (
                  <button key={kind ?? "none"} className={`chip ${ambient === kind ? "selected" : ""}`}
                    aria-pressed={ambient === kind} onClick={() => session.setAmbient(kind)}>
                    {ambientLabel(kind)}
                  </button>
                ))}
              </div>
            )}
            {sheet === "mixer" && MIXER_CHANNELS.map(({ key, label }) => (
              <label className="mixer-row" key={key}>
                <span>{label}</span>
                <input type="range" min={0} max={1} step={0.01} value={volumes[key]}
                  style={{ "--fill": `${volumes[key] * 100}%` } as React.CSSProperties}
                  onChange={(event) => session.setVolume(key, Number(event.target.value))} />
                <span className="value">{Math.round(volumes[key] * 100)}%</span>
              </label>
            ))}
            {sheet === "frequencies" && (
              <>
                {custom ? (
                  frequencies.layers.map((layer, index) => {
                    const sameType = frequencies.layers.filter((other) => other.type === layer.type);
                    const label = sameType.length > 1
                      ? `${SOUND_LABELS[layer.type]} ${sameType.indexOf(layer) + 1}`
                      : SOUND_LABELS[layer.type];
                    return (
                      <div className="freq-layer" role="group" aria-label={label} key={index}>
                        <h3>{label}</h3>
                        <div className="freq-grid">
                          <BeatValues type={layer.type} carrierHz={layer.carrierHz}
                            beatHz={layer.fixedBeatHz ?? progress.beatHz} />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="freq-grid">
                    <BeatValues type={frequencies.mode === "headphone" ? "binaural" : "isochronic"}
                      carrierHz={frequencies.carrierHz} beatHz={progress.beatHz} />
                  </div>
                )}
                {custom && frequencies.layers.length === 0 && (
                  <p className="freq-note">This audio has no entrainment layers.</p>
                )}
                {binaural && (
                  <p className="freq-note">🎧 Use headphones — the binaural effect needs both ears</p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
