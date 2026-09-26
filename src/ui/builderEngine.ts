import { BuilderEngine } from "../audio/builder";
import { acquireAudio, releaseAudio } from "./audioContext";

/**
 * Shared BuilderEngine singleton (quick-260707-a47): Studio and Library both
 * start custom sessions through this module, so only one custom session
 * plays at a time. It runs on the app's shared AudioContext; the engine
 * itself never creates one (ENG-07).
 */

let engine: BuilderEngine | null = null;
/** Watches for a timed session's natural end while no view polls the transport. */
let endWatch: number | undefined;

/** Call inside the user gesture that starts playback (UI-08). */
export function ensureBuilder(): BuilderEngine {
  const ctx = acquireAudio("builder");
  engine ??= new BuilderEngine(ctx);
  // The user may navigate away from Studio/Library mid-session; without a
  // watcher, nobody would notice the end and release the audio device.
  window.clearInterval(endWatch);
  endWatch = window.setInterval(getNowPlaying, 1000);
  return engine;
}

/** The engine if it was ever created (null before first ensureBuilder()). */
export function getBuilderEngine(): BuilderEngine | null {
  return engine;
}

/**
 * Which library/studio item currently owns the shared engine. Lives at module
 * level so a transport survives its view unmounting: navigating away from
 * Library while audio plays and coming back must restore the Stop control
 * instead of showing a Play button over audible audio.
 */
let nowPlayingId: string | null = null;

/**
 * Told once when the item that owned the engine stops playing: `naturalEnd`
 * when a timed session reached its end, otherwise something stopped it first
 * (Stop, another item, or a preset session taking over).
 */
type PlaybackEndListener = (id: string, naturalEnd: boolean) => void;
const endListeners = new Set<PlaybackEndListener>();

export function onBuilderPlaybackEnd(listener: PlaybackEndListener): () => void {
  endListeners.add(listener);
  return () => endListeners.delete(listener);
}

function endItem(naturalEnd: boolean): void {
  const id = nowPlayingId;
  nowPlayingId = null;
  if (id === null) return;
  for (const listener of endListeners) listener(id, naturalEnd);
}

export function setNowPlaying(id: string | null): void {
  // Another item took the engine over: the one playing so far was stopped.
  if (id !== nowPlayingId) endItem(false);
  nowPlayingId = id;
}

/**
 * The id of the item playing on the shared engine, or null. Also self-heals
 * the engine's one blind spot: a timed session that reaches its natural end
 * keeps isRunning true until stop() is called — detect that here (remaining
 * time exhausted) and stop it, so transport polls see a clean idle state.
 */
export function getNowPlaying(): string | null {
  if (!engine || !engine.isRunning) {
    goIdle(false);
    return null;
  }
  const p = engine.progress();
  if (p.remainingSec !== null && p.remainingSec <= 0) {
    engine.stop();
    goIdle(true);
    return null;
  }
  return nowPlayingId;
}

/** Stop custom-audio playback and clear the shared transport state. */
export function stopBuilderPlayback(): void {
  engine?.stop();
  goIdle(false);
}

/** Clear the transport and hand the audio device back. */
function goIdle(naturalEnd: boolean): void {
  endItem(naturalEnd);
  window.clearInterval(endWatch);
  releaseAudio("builder");
}
