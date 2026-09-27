import { useEffect, useReducer, useSyncExternalStore } from "react";
import { isEntrainment } from "../audio/builder";
import type { CustomSession } from "../audio/builder";
import type { SessionSchedule } from "../audio/schedule";
import type { SessionConfig } from "../audio/session";
import { presetSnapshot } from "../state/listening";
import type { AudioSnapshot, Play } from "../state/listening";
import { createNowPlaying } from "../state/nowPlaying";
import type { PlayProgress, PlaySetup, RunningPlay } from "../state/nowPlaying";
import { recordSessionCompleted } from "../state/progress";
import { listeningEnv, playKeeper } from "../lib/listening";
import {
  audioClockSec,
  isAudioBlocked,
  isAudioPaused,
  isAudioRunning,
  subscribeAudio,
} from "./audioContext";
import {
  ensureBuilder,
  onBuilderPlaybackEnd,
  setBuilderItem,
  stopBuilderPlayback,
} from "./builderEngine";

/**
 * The app's Now Playing (src/state/nowPlaying.ts): the one running Play,
 * fed by thin adapters on the two playback paths — preset sessions
 * (SessionEngine, through useSession) and the Library (BuilderEngine). Studio
 * previews are not Plays: only items the Library started are followed. Every
 * ended Play goes to the Listening History (ADR-017), and one that counts as
 * a completed session to the weekly streak.
 */

/** Library audio shows the Meditating Scene until Custom Audio can choose one (#43). */
const LIBRARY_SCENE = "deep-meditation";

// Both engines play on the one shared AudioContext, so its clock is the
// running Play's: every time Now Playing shows or records is time on it.
const nowPlaying = createNowPlaying({ ...listeningEnv, audioSec: audioClockSec });

// Its state gives the flags: the User's pause wins over the device's, and a
// device pause only shows as a hold once the browser wants a tap to resume.
subscribeAudio(() => {
  if (isAudioPaused()) nowPlaying.setAudio("paused");
  else if (isAudioRunning()) nowPlaying.setAudio("playing");
  else nowPlaying.setAudio(isAudioBlocked() ? "held" : "waiting");
});

/** Silences the running Play: the stop of the engine that plays it. */
let halt: (() => void) | null = null;
/** The running Play's item on the shared builder transport, when the Library started it. */
let libraryItem: string | null = null;
/** Keeps the running Play in the Listening History of the User signed in at its start. */
let keepPlay: ((play: Play | null) => void) | null = null;

nowPlaying.subscribe((event) => {
  if (event.type === "start") {
    keepPlay = playKeeper();
  } else if (event.type === "stop" || event.type === "end") {
    halt = null;
    libraryItem = null;
    const { audio, play, completedAt } = event.ending;
    keepPlay?.(play);
    if (completedAt) recordSessionCompleted(audio.id, new Date(completedAt));
  }
});

function begin(setup: PlaySetup, haltAudio: () => void): void {
  nowPlaying.start(setup);
  halt = haltAudio;
}

/** End the running Play before its end (End session); Now Playing decides its credit. */
export function stopPlay(): void {
  const haltAudio = halt;
  nowPlaying.stop();
  haltAudio?.();
}

// Closing the app, or leaving it for another page, ends the Play there.
window.addEventListener("pagehide", stopPlay);

/** Preset sessions: useSession reports the start, with the engine's stop, and the natural end. */
export const presetPlays = {
  started(config: SessionConfig, schedule: SessionSchedule, haltAudio: () => void): void {
    begin(
      {
        audio: presetSnapshot(config.preset),
        scene: config.preset.id,
        plannedMin: config.durationMin,
        schedule,
        frequencies: { mode: config.mode, carrierHz: config.preset.carrierHz },
      },
      haltAudio,
    );
  },
  ended(): void {
    if (nowPlaying.current()?.audio.kind === "preset") nowPlaying.end();
  },
};

// The shared transport reports how the Library's item ended, wherever the
// User is by then: its natural end, Stop, or another item, the Studio or a
// preset session taking the engine over.
onBuilderPlaybackEnd((id, naturalEnd) => {
  if (id !== libraryItem) return;
  if (naturalEnd) nowPlaying.end();
  else nowPlaying.stop();
});

/**
 * Library playback: play `session` on the shared builder engine as the
 * running Play, listed as `audio`. Call inside the user gesture.
 */
export function startLibraryPlay(
  audio: AudioSnapshot,
  session: CustomSession,
  durationMin: number | null,
): void {
  const engine = ensureBuilder();
  engine.stop();
  engine.start(session.layers, session.curve, durationMin);
  setBuilderItem(audio.id);
  begin(
    {
      audio,
      scene: LIBRARY_SCENE,
      plannedMin: durationMin,
      schedule: engine.getSchedule()!,
      frequencies: {
        layers: session.layers.flatMap((layer) =>
          isEntrainment(layer.type)
            ? [
                {
                  type: layer.type,
                  carrierHz: layer.carrierHz,
                  fixedBeatHz: layer.beatMode === "fixed" ? layer.fixedBeatHz : null,
                },
              ]
            : [],
        ),
      },
    },
    stopBuilderPlayback,
  );
  libraryItem = audio.id;
}

/** Told on start, pause, resume, device hold, stop and natural end. Returns the unsubscribe. */
export const subscribeNowPlaying = nowPlaying.subscribe;

/** The running Play, or null; re-renders on every change. */
export function useNowPlaying(): RunningPlay | null {
  return useSyncExternalStore(nowPlaying.subscribe, nowPlaying.current);
}

/** Where the running Play is now, or null; repainted while it runs. */
export function usePlayProgress(): PlayProgress | null {
  const play = useNowPlaying();
  const [, repaint] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!play) return;
    const id = window.setInterval(repaint, 250);
    return () => window.clearInterval(id);
  }, [play]);
  return nowPlaying.progress();
}
