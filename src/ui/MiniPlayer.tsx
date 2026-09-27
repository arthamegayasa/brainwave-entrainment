import { BAND_COLORS, formatClock } from "./bands";
import { useNowPlaying, usePlayProgress } from "./nowPlaying";
import { PlayToggle } from "./Player";
import { scenePainting } from "./scenes";

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
        <img className="mini-player-scene" src={scenePainting(play.scene, 768)} alt="" />
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
      <PlayToggle className="mini-player-play" paused={paused} held={held} />
    </aside>
  );
}
