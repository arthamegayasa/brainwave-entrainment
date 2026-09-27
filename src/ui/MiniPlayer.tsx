import { BAND_COLORS, formatClock } from "./bands";
import { pauseAudio, resumeAudio } from "./audioContext";
import { useNowPlaying, usePlayProgress } from "./nowPlaying";

interface MiniPlayerProps {
  /** Opens the running Play's full view. */
  onOpen: () => void;
}

/**
 * The running Play, shrunk to a bar at the bottom of the other views: its
 * Scene, name, time left, and Pause/Play. There is no Stop: ending a Play is
 * a deliberate choice made in the Player.
 */
export function MiniPlayer({ onOpen }: MiniPlayerProps) {
  const play = useNowPlaying();
  const progress = usePlayProgress();
  if (!play || !progress) return null;
  const { audio, paused, held } = play;
  const status = held ? "Audio held by device" : paused ? "Paused" : null;

  return (
    <aside
      className="mini-player"
      aria-label="Mini-player"
      style={{ "--accent": audio.band ? BAND_COLORS[audio.band] : undefined } as React.CSSProperties}
    >
      <button className="mini-player-open" aria-label={`Open ${audio.name}`} onClick={onOpen}>
        <img className="mini-player-scene" src={`/scenes/${play.scene}-768.webp`} alt="" />
        <span className="mini-player-text">
          <span className="mini-player-name">{audio.name}</span>
          <span className="mini-player-status">
            {status && <>{status} · </>}
            <span className="mini-player-time">
              {formatClock(progress.remainingSec ?? progress.elapsedSec)}
            </span>
          </span>
        </span>
      </button>
      <button
        className={`mini-player-play${held ? " player-held" : ""}`}
        aria-label={held ? "Tap to resume" : paused ? "Resume Play" : "Pause Play"}
        onClick={paused || held ? resumeAudio : pauseAudio}
      >
        <span aria-hidden>{paused || held ? "▶" : "❚❚"}</span>
      </button>
    </aside>
  );
}
