import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SessionEngine, DEFAULT_VOLUMES } from "../audio/session";
import type {
  ListeningMode,
  SessionConfig,
  SessionProgress,
  SessionVolumes,
} from "../audio/session";
import type { Preset } from "../audio/presets";
import type { AmbientKind } from "../audio/types";
import type { SessionSchedule } from "../audio/schedule";
import { loadPrefs, savePrefs } from "../state/prefs";
import {
  acquireAudio,
  isAudioPaused,
  pauseAudio,
  releaseAudio,
  resumeAudio,
  subscribeAudio,
} from "./audioContext";
import { presetPlays } from "./playAdapters";

// Module-level singleton on the shared AudioContext; the engine itself never
// creates a context.
let engine: SessionEngine | null = null;

/** Call inside the user gesture that starts playback. */
function ensureEngine(): SessionEngine {
  const ctx = acquireAudio("session");
  engine ??= new SessionEngine(ctx, loadPrefs().volumes);
  return engine;
}

/** Best-effort Media Session wiring: lockscreen metadata + controls. */
function updateMediaSession(cfg: SessionConfig | null, handlers?: { stop: () => void }) {
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
    navigator.mediaSession.setActionHandler("stop", () => handlers?.stop());
  } catch {
    /* media session is progressive enhancement only */
  }
}

const IDLE_PROGRESS: SessionProgress = {
  running: false,
  elapsedSec: 0,
  remainingSec: null,
  currentBeatHz: 0,
  carrierHz: 0,
  phase: "done",
};

export interface SessionState {
  active: boolean;
  /** The user paused: the audio clock, and with it the whole session, is held. */
  paused: boolean;
  preset: Preset | null;
  config: SessionConfig | null;
  progress: SessionProgress;
  volumes: SessionVolumes;
}

export interface SessionApi {
  state: SessionState;
  start: (config: SessionConfig) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  setAmbient: (kind: AmbientKind | null) => void;
  setVolume: (channel: keyof SessionVolumes, v: number) => void;
  getSchedule: () => SessionSchedule | null;
}

/**
 * React binding for SessionEngine: gesture-safe start + polled progress.
 * `onEnded` receives when a finite session actually ended, read off the audio
 * clock: pauses and device interruptions move it later, a throttled poll
 * that notices hours afterwards does not.
 */
export function useSession(onEnded?: (endedAt: Date) => void): SessionApi {
  const [active, setActive] = useState(false);
  const [config, setConfig] = useState<SessionConfig | null>(null);
  const [progress, setProgress] = useState<SessionProgress>(IDLE_PROGRESS);
  const [volumes, setVolumes] = useState<SessionVolumes>({ ...DEFAULT_VOLUMES });
  const paused = useSyncExternalStore(subscribeAudio, isAudioPaused);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  useEffect(() => {
    if (!active || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = paused ? "paused" : "playing";
  }, [active, paused]);

  // Poll progress for the UI only — audio timing itself lives on the audio
  // clock inside SessionEngine; this interval merely repaints.
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      if (!engine) return;
      const p = engine.progress();
      setProgress(p);
      if (!p.running) {
        const cfg = engine.getConfig();
        const overrunSec =
          cfg?.durationMin == null ? 0 : Math.max(0, p.elapsedSec - cfg.durationMin * 60);
        setActive(false);
        setConfig(null);
        releaseAudio("session");
        presetPlays.ended();
        onEndedRef.current?.(new Date(Date.now() - overrunSec * 1000));
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [active]);

  const stop = useCallback(() => {
    engine?.stop();
    presetPlays.stopped();
    releaseAudio("session");
    setActive(false);
    setConfig(null);
    setProgress(IDLE_PROGRESS);
    updateMediaSession(null);
  }, []);

  const start = useCallback(
    (cfg: SessionConfig) => {
      const e = ensureEngine();
      e.start(cfg);
      presetPlays.started(cfg.preset, cfg.durationMin);
      setConfig(cfg);
      setActive(true);
      setProgress(e.progress());
      setVolumes(e.getVolumes());
      updateMediaSession(cfg, { stop });
      savePrefs({
        lastPresetId: cfg.preset.id,
        lastDurationMin: cfg.durationMin === null ? "inf" : cfg.durationMin,
        lastMode: cfg.mode,
        lastAmbient: cfg.ambient,
      });
    },
    [stop],
  );

  const setAmbient = useCallback((kind: AmbientKind | null) => {
    engine?.setAmbient(kind);
    setConfig((prev) => (prev ? { ...prev, ambient: kind } : prev));
  }, []);

  const setVolume = useCallback(
    (channel: keyof SessionVolumes, v: number) => {
      engine?.setVolume(channel, v);
      setVolumes((prev) => {
        const next = { ...prev, [channel]: Math.min(Math.max(v, 0), 1) };
        savePrefs({ volumes: next });
        return next;
      });
    },
    [],
  );

  const getSchedule = useCallback((): SessionSchedule | null => {
    return engine?.getSchedule() ?? null;
  }, []);

  return {
    state: {
      active,
      paused: active && paused,
      preset: config?.preset ?? null,
      config,
      progress,
      volumes,
    },
    start,
    stop,
    pause: pauseAudio,
    resume: resumeAudio,
    setAmbient,
    setVolume,
    getSchedule,
  };
}

export type { ListeningMode, SessionConfig };
