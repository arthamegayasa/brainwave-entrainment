import { describe, it, expect } from "vitest";
import { buildSchedule } from "../src/audio/schedule";
import { PRESETS } from "../src/audio/presets";
import { createNowPlaying } from "../src/state/nowPlaying";
import type {
  AudioState,
  EntrainmentLayer,
  NowPlayingEvent,
  PlaySetup,
} from "../src/state/nowPlaying";

const MEDITATING = PRESETS.find((p) => p.id === "deep-meditation")!;

/** Meditating for 30 minutes in Headphones mode: the Beat eases 10 → 6 Hz over 12 minutes. */
const PRESET_PLAY: PlaySetup = {
  audio: { kind: "preset", id: "deep-meditation", name: "Meditating", emoji: "🧘", band: "theta" },
  scene: "deep-meditation",
  plannedMin: 30,
  schedule: buildSchedule(MEDITATING, 30 * 60),
  frequencies: { mode: "headphone", carrierHz: 528 },
};

const CUSTOM_LAYERS: EntrainmentLayer[] = [
  { type: "binaural", carrierHz: 200, fixedBeatHz: null },
  { type: "isochronic", carrierHz: 432, fixedBeatHz: 10 },
];

/** Custom Audio for 20 minutes: one layer follows the ramp 8 → 4 Hz, one keeps a fixed Beat. */
const CUSTOM_PLAY: PlaySetup = {
  audio: { kind: "custom", id: "audio-7", name: "Evening theta", emoji: null, band: "theta" },
  scene: "deep-meditation",
  plannedMin: 20,
  schedule: buildSchedule(
    { ...MEDITATING, startHz: 8, targetHz: 4, endHz: null, rampInMin: 5, rampOutMin: 0 },
    20 * 60,
  ),
  frequencies: { layers: CUSTOM_LAYERS },
};

/**
 * The device's two clocks: the wall clock, starting 21:00 WIB, and the audio
 * clock (AudioContext.currentTime), which moves with it only while the audio
 * plays. Both only move when the test says so.
 */
function fakeClocks() {
  let wallMs = Date.parse("2026-09-26T21:00:00+07:00");
  let audioSec = 500; // the shared context has played before
  let playing = false;
  return {
    now: () => wallMs,
    audioSec: () => audioSec,
    advance: (sec: number) => {
      wallMs += sec * 1000;
      if (playing) audioSec += sec;
    },
    /** The audio stands still or plays again, whether or not the app has heard yet. */
    play: (on: boolean) => {
      playing = on;
    },
  };
}

/** Now Playing on fake clocks, with every event it sends recorded. */
function nowPlaying() {
  const clock = fakeClocks();
  let n = 0;
  const np = createNowPlaying({
    now: clock.now,
    audioSec: clock.audioSec,
    newId: () => `play-${++n}`,
    timeZone: () => "Asia/Jakarta",
  });
  const events: NowPlayingEvent[] = [];
  np.subscribe((event) => events.push(event));
  /** The audio changes, and Now Playing hears of it at once, as the app glue tells it. */
  const setAudio = (state: AudioState) => {
    clock.play(state === "playing");
    np.setAudio(state);
  };
  return { np, clock, setAudio, events, types: () => events.map((e) => e.type) };
}

describe("Now Playing", () => {
  it("exposes the running Play of either engine and tells subscribers it started", () => {
    const { np, types } = nowPlaying();
    expect(np.current()).toBeNull();

    np.start(PRESET_PLAY);
    expect(np.current()).toMatchObject({
      audio: { kind: "preset", id: "deep-meditation", name: "Meditating" },
      scene: "deep-meditation",
      plannedMin: 30,
      frequencies: { mode: "headphone", carrierHz: 528 },
      paused: false,
      held: false,
    });

    np.start(CUSTOM_PLAY);
    expect(np.current()).toMatchObject({
      audio: { kind: "custom", id: "audio-7", name: "Evening theta" },
      frequencies: { layers: CUSTOM_LAYERS },
    });
    expect(types()).toEqual(["start", "stop", "start"]);
  });

  it("counts time only while the audio plays, and holds the ramp in place while paused", () => {
    const { np, setAudio, clock, types } = nowPlaying();
    np.start(PRESET_PLAY); // the device has not resumed the audio yet
    clock.advance(2);
    expect(np.progress()).toMatchObject({ elapsedSec: 0, remainingSec: 1800, beatHz: 10 });

    setAudio("playing");
    clock.advance(6 * 60); // halfway down the 12-minute ramp
    setAudio("paused");
    expect(np.current()).toMatchObject({ paused: true, held: false });
    const heldAt = np.progress();
    expect(heldAt).toMatchObject({ elapsedSec: 360, remainingSec: 1440, beatHz: 8, phase: "rampIn" });
    clock.advance(30 * 60);
    expect(np.progress()).toEqual(heldAt);

    setAudio("waiting"); // the User tapped resume; the device is resuming
    expect(np.current()).toMatchObject({ paused: false, held: false });
    clock.advance(1);
    expect(np.progress()).toEqual(heldAt);
    setAudio("playing");
    clock.advance(6 * 60);
    expect(np.progress()).toMatchObject({ elapsedSec: 720, beatHz: 6, phase: "hold" });
    expect(types()).toEqual(["start", "pause", "resume"]);
  });

  it("shows a device hold until the User taps to resume, without counting the time held", () => {
    const { np, setAudio, clock, types } = nowPlaying();
    setAudio("playing");
    np.start(CUSTOM_PLAY);
    clock.advance(60);
    setAudio("held"); // a call took the audio, and the browser wants a tap
    expect(np.current()).toMatchObject({ paused: false, held: true });
    clock.advance(10 * 60);
    setAudio("playing");
    expect(np.current()).toMatchObject({ paused: false, held: false });
    clock.advance(60);
    expect(np.progress()).toMatchObject({ elapsedSec: 120, remainingSec: 1080 });
    // A short interruption the device undoes by itself is neither a pause nor a hold.
    setAudio("waiting");
    clock.advance(5);
    setAudio("playing");
    expect(np.progress()).toMatchObject({ elapsedSec: 120 });
    expect(types()).toEqual(["start", "hold", "resume"]);
  });

  it("follows the audio clock: wall time that passes while it stands still is not heard", () => {
    const { np, clock, setAudio } = nowPlaying();
    setAudio("playing");
    np.start(PRESET_PLAY);
    clock.advance(60);
    // A call froze the audio while the page was frozen in the background:
    // the audio clock stops, and the statechange has not arrived yet.
    clock.play(false);
    clock.advance(20 * 60);
    const progress = np.progress();
    expect(progress).toMatchObject({ elapsedSec: 60, remainingSec: 1740, phase: "rampIn" });
    expect(progress?.beatHz).toBeCloseTo(9.667, 3);
    expect(np.stop()).toMatchObject({
      play: { listenedSec: 60, outcome: "stopped" },
      completedAt: null,
    });
  });

  describe.each([
    ["a Preset", PRESET_PLAY],
    ["Custom Audio", CUSTOM_PLAY],
  ])("completion credit for %s", (_, setup) => {
    const lengthSec = setup.plannedMin! * 60;

    it("a stop before 5 minutes listened is not a completed session", () => {
      const { np, setAudio, clock, events } = nowPlaying();
      setAudio("playing");
      np.start(setup);
      clock.advance(4 * 60);
      setAudio("paused");
      clock.advance(10 * 60); // paused time is not listening
      setAudio("playing");
      clock.advance(59);
      const ending = np.stop();
      expect(ending).toMatchObject({
        audio: { id: setup.audio.id },
        naturalEnd: false,
        play: { listenedSec: 299, outcome: "stopped" },
        completedAt: null,
      });
      expect(events.at(-1)).toEqual({ type: "stop", ending });
      expect(np.current()).toBeNull();
    });

    it("a stop after 5 minutes listened is a completed session, dated at the stop", () => {
      const { np, setAudio, clock } = nowPlaying();
      setAudio("playing");
      np.start(setup);
      clock.advance(5 * 60);
      expect(np.stop()).toMatchObject({
        naturalEnd: false,
        play: { listenedSec: 300, outcome: "stopped" },
        completedAt: "2026-09-26T14:05:00.000Z",
      });
    });

    it("a natural end is a completed session, dated when the whole length had been heard", () => {
      const { np, setAudio, clock, events } = nowPlaying();
      setAudio("playing");
      np.start(setup);
      clock.advance(60);
      setAudio("paused");
      clock.advance(60);
      setAudio("playing");
      clock.advance(lengthSec - 60 + 2 * 3600); // the end was noticed hours later
      expect(np.progress()).toMatchObject({ elapsedSec: lengthSec, remainingSec: 0 });
      const ending = np.end();
      const endedAt = new Date(Date.parse("2026-09-26T14:01:00Z") + lengthSec * 1000).toISOString();
      expect(ending).toMatchObject({
        naturalEnd: true,
        play: { listenedSec: lengthSec, outcome: "completed", endedAt },
        completedAt: endedAt,
      });
      expect(events.at(-1)).toEqual({ type: "end", ending });
    });

    it("a stop after the whole length was heard counts as completed at the end", () => {
      const { np, setAudio, clock } = nowPlaying();
      setAudio("playing");
      np.start(setup);
      clock.advance(lengthSec + 30);
      const endedAt = new Date(Date.parse("2026-09-26T14:00:00Z") + lengthSec * 1000).toISOString();
      expect(np.stop()).toMatchObject({
        play: { outcome: "completed", endedAt },
        completedAt: endedAt,
      });
    });
  });

  it("an open-ended (∞) Play has no remaining time and counts once 5 minutes were heard", () => {
    const { np, setAudio, clock } = nowPlaying();
    setAudio("playing");
    np.start({ ...CUSTOM_PLAY, plannedMin: null });
    clock.advance(90 * 60);
    expect(np.progress()).toMatchObject({ elapsedSec: 5400, remainingSec: null, beatHz: 4 });
    expect(np.stop()).toMatchObject({
      play: { outcome: "open", listenedSec: 5400 },
      completedAt: "2026-09-26T15:30:00.000Z",
    });
  });

  it("a natural end counts even when the whole Play was shorter than 5 minutes", () => {
    const { np, setAudio, clock } = nowPlaying();
    setAudio("playing");
    np.start({ ...PRESET_PLAY, plannedMin: 2 });
    clock.advance(2 * 60);
    expect(np.end()).toMatchObject({
      play: { listenedSec: 120, outcome: "completed" },
      completedAt: "2026-09-26T14:02:00.000Z",
    });
  });

  it("starting a Play stops the one still running, with its credit", () => {
    const { np, setAudio, clock, events } = nowPlaying();
    setAudio("playing");
    np.start(PRESET_PLAY);
    clock.advance(6 * 60);
    np.start(CUSTOM_PLAY);
    expect(events.map((e) => e.type)).toEqual(["start", "stop", "start"]);
    expect(events[1]).toMatchObject({
      ending: { audio: { id: "deep-meditation" }, completedAt: "2026-09-26T14:06:00.000Z" },
    });
    expect(np.progress()).toMatchObject({ elapsedSec: 0 });
  });

  it("ends each Play once, and nothing without one", () => {
    const { np, setAudio, clock, types } = nowPlaying();
    expect(np.stop()).toBeNull();
    expect(np.end()).toBeNull();
    setAudio("paused");
    expect(np.progress()).toBeNull();

    setAudio("playing");
    np.start(PRESET_PLAY);
    clock.advance(10);
    expect(np.stop()).toMatchObject({ play: null, completedAt: null }); // a mis-tap is not a Play
    expect(np.end()).toBeNull();
    expect(types()).toEqual(["start", "stop"]);
  });
});
