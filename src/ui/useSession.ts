import { useCallback, useEffect, useRef, useState } from "react";
import { SessionEngine, DEFAULT_VOLUMES } from "../audio/session";
import type {
  ListeningMode,
  SessionConfig,
  SessionProgress,
  SessionVolumes,
} from "../audio/session";
import type { Preset } from "../audio/presets";
import type { AmbientKind } from "../audio/types";

// Module-level singletons: the AudioContext must be created/resumed inside a
// user gesture (UI-08); the engine itself never creates one (ENG-07).
let ctx: AudioContext | null = null;
let engine: SessionEngine | null = null;

async function ensureEngine(): Promise<SessionEngine> {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") await ctx.resume();
  if (!engine) engine = new SessionEngine(ctx);
  return engine;
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
  preset: Preset | null;
  config: SessionConfig | null;
  progress: SessionProgress;
  volumes: SessionVolumes;
}

export interface SessionApi {
  state: SessionState;
  start: (config: SessionConfig) => Promise<void>;
  stop: () => void;
  setAmbient: (kind: AmbientKind | null) => void;
  setVolume: (channel: keyof SessionVolumes, v: number) => void;
}

/** React binding for SessionEngine: gesture-safe start + polled progress. */
export function useSession(onEnded?: () => void): SessionApi {
  const [active, setActive] = useState(false);
  const [config, setConfig] = useState<SessionConfig | null>(null);
  const [progress, setProgress] = useState<SessionProgress>(IDLE_PROGRESS);
  const [volumes, setVolumes] = useState<SessionVolumes>({ ...DEFAULT_VOLUMES });
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  // Poll progress for the UI only — audio timing itself lives on the audio
  // clock inside SessionEngine (SCH-03); this interval merely repaints.
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      if (!engine) return;
      const p = engine.progress();
      setProgress(p);
      if (!p.running) {
        setActive(false);
        setConfig(null);
        onEndedRef.current?.();
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [active]);

  const start = useCallback(async (cfg: SessionConfig) => {
    const e = await ensureEngine();
    e.start(cfg);
    setConfig(cfg);
    setActive(true);
    setProgress(e.progress());
    setVolumes(e.getVolumes());
  }, []);

  const stop = useCallback(() => {
    engine?.stop();
    setActive(false);
    setConfig(null);
    setProgress(IDLE_PROGRESS);
  }, []);

  const setAmbient = useCallback((kind: AmbientKind | null) => {
    engine?.setAmbient(kind);
    setConfig((prev) => (prev ? { ...prev, ambient: kind } : prev));
  }, []);

  const setVolume = useCallback(
    (channel: keyof SessionVolumes, v: number) => {
      engine?.setVolume(channel, v);
      setVolumes((prev) => ({ ...prev, [channel]: Math.min(Math.max(v, 0), 1) }));
    },
    [],
  );

  return {
    state: {
      active,
      preset: config?.preset ?? null,
      config,
      progress,
      volumes,
    },
    start,
    stop,
    setAmbient,
    setVolume,
  };
}

export type { ListeningMode, SessionConfig };
