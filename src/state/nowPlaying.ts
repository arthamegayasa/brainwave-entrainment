/**
 * Now Playing: the single source for the running Play, whichever engine plays
 * it (a Preset on SessionEngine, Custom Audio on BuilderEngine). Pure
 * TypeScript — NO React, NO audio: the clock is injected, so the rules are
 * testable without a browser. The app glue lives in src/ui/nowPlaying.ts.
 *
 * It holds what the Player and the Library rows show, follows the device's
 * audio, counts time the way the Listening core counts time listened (only
 * while the audio plays), and decides, when the Play ends, its Listening
 * History Play and whether it counts as a completed session.
 */

import { beatAt, phaseAt } from "../audio/schedule";
import type { SessionPhase, SessionSchedule } from "../audio/schedule";
import type { ListeningMode } from "../audio/session";
import type { EntrainmentLayerType } from "../audio/builder";
import { createPlayRecorder } from "./listening";
import type { AudioSnapshot, ListeningEnv, Play } from "./listening";

/** A Play counts as a completed session (weekly streak) at its natural end, or after this much listening. */
export const COMPLETION_MIN_SEC = 300;

/** An entrainment layer of Custom Audio, as its frequency details read. */
export interface EntrainmentLayer {
  type: EntrainmentLayerType;
  carrierHz: number;
  /** A constant Beat; null when the layer follows the Beat of the session ramp. */
  fixedBeatHz: number | null;
}

/** What frequency details show: a Preset's Listening mode and Carrier, or Custom Audio's entrainment layers. */
export type PlayFrequencies =
  | { mode: ListeningMode; carrierHz: number }
  | { layers: EntrainmentLayer[] };

/** Everything the running Play shows, known when it starts. */
export interface PlaySetup {
  audio: AudioSnapshot;
  /** The Scene painting (a SceneArt id). */
  scene: string;
  /** The chosen length; null for an open-ended (∞) Play. */
  plannedMin: number | null;
  /** The Beat along the session ramp. */
  schedule: SessionSchedule;
  frequencies: PlayFrequencies;
}

/**
 * The device's audio: playing; waiting to play (starting, or recovering from
 * an interruption by itself); paused by the User; or held by the device until
 * the User taps to resume.
 */
export type AudioState = "playing" | "waiting" | "paused" | "held";

/** The running Play: a new object on every change, so readers can compare by identity. */
export interface RunningPlay extends PlaySetup {
  /** The User paused. */
  paused: boolean;
  /** The device holds the audio (a call, another app) and a tap resumes it. */
  held: boolean;
}

/** Where the running Play is now. */
export interface PlayProgress {
  /** Seconds heard, pauses and interruptions excluded; never past the length. */
  elapsedSec: number;
  /** null for an open-ended (∞) Play. */
  remainingSec: number | null;
  /** The Beat of the session ramp now. */
  beatHz: number;
  phase: SessionPhase;
}

/** How a Play ended. */
export interface PlayEnding {
  audio: AudioSnapshot;
  naturalEnd: boolean;
  /** For the Listening History; null for a playback too short to be a Play. */
  play: Play | null;
  /** When it counts as a completed session (weekly streak), ISO; null when it does not count. */
  completedAt: string | null;
}

export type NowPlayingEvent =
  | { type: "start"; play: RunningPlay }
  | { type: "pause" | "resume" | "hold" }
  | { type: "stop" | "end"; ending: PlayEnding };

export interface NowPlaying {
  /** The running Play, or null. */
  current(): RunningPlay | null;
  /** Where the running Play is now, or null. */
  progress(): PlayProgress | null;
  /** Told on start, pause, resume, device hold, stop and natural end. Returns the unsubscribe. */
  subscribe(listener: (event: NowPlayingEvent) => void): () => void;
  /** A Play began; one still running is stopped first. */
  start(setup: PlaySetup): void;
  /** The device's audio changed, with or without a running Play. */
  setAudio(state: AudioState): void;
  /** The running Play reached its natural end: how it ended, or null without one. */
  end(): PlayEnding | null;
  /** The running Play was stopped before its end: how it ended, or null without one. */
  stop(): PlayEnding | null;
}

export function createNowPlaying(env: ListeningEnv): NowPlaying {
  const recorder = createPlayRecorder(env);
  const listeners = new Set<(event: NowPlayingEvent) => void>();
  let audio: AudioState = "waiting";
  let running: RunningPlay | null = null;

  function emit(event: NowPlayingEvent): void {
    for (const listener of [...listeners]) listener(event);
  }

  // Time counts only while the audio plays.
  function followAudio(): void {
    if (audio === "playing") recorder.resume();
    else recorder.pause();
  }

  function finish(naturalEnd: boolean): PlayEnding | null {
    const ended = running;
    if (!ended) return null;
    running = null;
    const play = naturalEnd ? recorder.end() : recorder.stop();
    const counts =
      play !== null && (play.outcome === "completed" || play.listenedSec >= COMPLETION_MIN_SEC);
    const ending: PlayEnding = {
      audio: ended.audio,
      naturalEnd,
      play,
      completedAt: counts ? play.endedAt : null,
    };
    emit({ type: naturalEnd ? "end" : "stop", ending });
    return ending;
  }

  return {
    current: () => running,

    progress() {
      if (!running) return null;
      const lengthSec = running.plannedMin === null ? null : running.plannedMin * 60;
      const heardSec = recorder.heardSec();
      const elapsedSec = lengthSec === null ? heardSec : Math.min(heardSec, lengthSec);
      return {
        elapsedSec,
        remainingSec: lengthSec === null ? null : lengthSec - elapsedSec,
        beatHz: beatAt(running.schedule, elapsedSec),
        phase: phaseAt(running.schedule, elapsedSec),
      };
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    start(setup) {
      finish(false);
      recorder.start(setup.audio, setup.plannedMin);
      followAudio();
      running = { ...setup, paused: audio === "paused", held: audio === "held" };
      emit({ type: "start", play: running });
    },

    setAudio(state) {
      if (state === audio) return;
      audio = state;
      if (!running) return;
      followAudio();
      const paused = state === "paused";
      const held = state === "held";
      if (paused === running.paused && held === running.held) return;
      running = { ...running, paused, held };
      emit({ type: paused ? "pause" : held ? "hold" : "resume" });
    },

    end: () => finish(true),
    stop: () => finish(false),
  };
}
