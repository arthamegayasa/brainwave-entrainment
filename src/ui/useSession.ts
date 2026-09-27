import { useCallback, useEffect, useState } from "react";
import { SessionEngine, DEFAULT_VOLUMES } from "../audio/session";
import type { ListeningMode, SessionConfig, SessionVolumes } from "../audio/session";
import type { AmbientKind } from "../audio/types";
import { loadPrefs, savePrefs } from "../state/prefs";
import { acquireAudio, pauseAudio, releaseAudio, resumeAudio } from "./audioContext";
import { presetPlays, stopPlay, useNowPlaying } from "./nowPlaying";

// Module-level singleton on the shared AudioContext; the engine itself never
// creates a context.
let engine: SessionEngine | null = null;
/** Watches for a finite session's natural end, which lives on the audio clock. */
let endWatch: number | undefined;

/** Call inside the user gesture that starts playback. */
function ensureEngine(): SessionEngine {
  const ctx = acquireAudio("session");
  engine ??= new SessionEngine(ctx, loadPrefs().volumes);
  return engine;
}

/** Best-effort Media Session wiring: lockscreen metadata + controls. */
function updateMediaSession(cfg: SessionConfig | null) {
  if (!("mediaSession" in navigator)) return;
  try {
    if (!cfg) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
      for (const action of ["play", "pause", "stop"] as const) {
        navigator.mediaSession.setActionHandler(action, null);
      }
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: `${cfg.preset.emoji} ${cfg.preset.name}`,
      artist: "SwaraSanti — Healing Audio",
      album: cfg.preset.tagline,
    });
    navigator.mediaSession.setActionHandler("play", resumeAudio);
    navigator.mediaSession.setActionHandler("pause", pauseAudio);
    navigator.mediaSession.setActionHandler("stop", stopPlay);
  } catch {
    /* media session is progressive enhancement only */
  }
}

/** Silence the preset session: what ending its Play early does to the audio. */
function haltSession(): void {
  window.clearInterval(endWatch);
  engine?.stop();
  releaseAudio("session");
  updateMediaSession(null);
}

export interface SessionApi {
  /** The ambient bed of the running preset session. */
  ambient: AmbientKind | null;
  volumes: SessionVolumes;
  start: (config: SessionConfig) => void;
  setAmbient: (kind: AmbientKind | null) => void;
  setVolume: (channel: keyof SessionVolumes, v: number) => void;
}

/**
 * React binding for SessionEngine: gesture-safe start and the session's
 * ambient and mixer. What plays, where it is, and how it ends live in Now
 * Playing (src/ui/nowPlaying.ts).
 */
export function useSession(): SessionApi {
  const [ambient, setAmbientState] = useState<AmbientKind | null>(null);
  const [volumes, setVolumes] = useState<SessionVolumes>({ ...DEFAULT_VOLUMES });
  const play = useNowPlaying();

  useEffect(() => {
    if (play?.audio.kind !== "preset" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = play.paused ? "paused" : "playing";
  }, [play]);

  const start = useCallback((cfg: SessionConfig) => {
    const e = ensureEngine();
    e.start(cfg);
    presetPlays.started(cfg, e.getSchedule()!, haltSession);
    // The end is on the audio clock: pauses and device interruptions move it.
    window.clearInterval(endWatch);
    endWatch = window.setInterval(() => {
      if (engine?.isRunning) return;
      window.clearInterval(endWatch);
      presetPlays.ended();
      releaseAudio("session");
    }, 1000);
    setAmbientState(cfg.ambient);
    setVolumes(e.getVolumes());
    updateMediaSession(cfg);
    savePrefs({
      lastPresetId: cfg.preset.id,
      lastDurationMin: cfg.durationMin === null ? "inf" : cfg.durationMin,
      lastMode: cfg.mode,
      lastAmbient: cfg.ambient,
    });
  }, []);

  const setAmbient = useCallback((kind: AmbientKind | null) => {
    engine?.setAmbient(kind);
    setAmbientState(kind);
  }, []);

  const setVolume = useCallback((channel: keyof SessionVolumes, v: number) => {
    engine?.setVolume(channel, v);
    setVolumes((prev) => {
      const next = { ...prev, [channel]: Math.min(Math.max(v, 0), 1) };
      savePrefs({ volumes: next });
      return next;
    });
  }, []);

  return { ambient, volumes, start, setAmbient, setVolume };
}

export type { ListeningMode, SessionConfig };
