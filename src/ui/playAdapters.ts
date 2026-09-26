import type { Preset } from "../audio/presets";
import { presetSnapshot } from "../state/listening";
import type { AudioSnapshot } from "../state/listening";
import { createHistoryRecorder } from "../lib/listening";
import type { HistoryRecorder } from "../lib/listening";
import { isAudioRunning, subscribeAudio } from "./audioContext";
import { onBuilderPlaybackEnd } from "./builderEngine";

/**
 * The thin adapters that feed the Play recorder of the Listening core
 * (ADR-017) from the two playback paths: preset sessions (SessionEngine,
 * through useSession) and the Library (BuilderEngine). Studio previews are
 * never recorded: the Library adapter only follows items the Library started.
 */

const presetRecorder = createHistoryRecorder();
const libraryRecorder = createHistoryRecorder();

// Both engines play on the one shared AudioContext: whenever its clock stops
// (the User paused, or a call or another app took the device), so does the
// time listened.
subscribeAudio(() => {
  for (const recorder of [presetRecorder, libraryRecorder]) {
    if (isAudioRunning()) recorder.resume();
    else recorder.pause();
  }
});

// Closing the app, or leaving it for another page, ends the listening there.
window.addEventListener("pagehide", () => {
  presetRecorder.stop();
  libraryRecorder.stop();
});

function begin(recorder: HistoryRecorder, audio: AudioSnapshot, plannedMin: number | null): void {
  recorder.start(audio, plannedMin);
  // A fresh start plays once the device has resumed the context.
  if (!isAudioRunning()) recorder.pause();
}

/** Preset sessions: useSession reports start, natural end and stop. */
export const presetPlays = {
  started(preset: Preset, durationMin: number | null): void {
    begin(presetRecorder, presetSnapshot(preset), durationMin);
  },
  ended: presetRecorder.end,
  stopped: presetRecorder.stop,
};

/** The Library item being recorded (its id on the shared builder transport). */
let libraryItem: string | null = null;

// The shared transport reports how the item ended, wherever the User is by
// then: its natural end, Stop, or another item, the Studio or a preset
// session taking the engine over.
onBuilderPlaybackEnd((id, naturalEnd) => {
  if (id !== libraryItem) return;
  libraryItem = null;
  if (naturalEnd) libraryRecorder.end();
  else libraryRecorder.stop();
});

/** Library playback: call once the item owns the shared builder transport. */
export function libraryPlayStarted(audio: AudioSnapshot, durationMin: number | null): void {
  libraryItem = audio.id;
  begin(libraryRecorder, audio, durationMin);
}
