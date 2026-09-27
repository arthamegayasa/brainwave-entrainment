/**
 * The app's single AudioContext and its device lifecycle.
 *
 * Preset sessions (SessionEngine) and custom audio (BuilderEngine) share one
 * context: one pair of ears, one hardware audio session. Engines never create
 * a context; everything device-specific lives here:
 *
 * - iOS runs Web Audio in the "ambient" session, which the ring/silent switch
 *   mutes. Declaring a "playback" session (Safari 16.4+) makes it behave like
 *   a music app: audible in silent mode.
 * - The OS may suspend or interrupt the context (calls, alarms, other apps,
 *   screen lock). The audio clock stops with it, so sessions pause in place;
 *   resume is retried at every chance, and the UI asks for a tap when the
 *   browser insists on one.
 * - An idle context still renders silence — draining battery and holding the
 *   audio session — so it is suspended once nothing is playing.
 */

import { createSilentWav } from "../audio/silentWav";

/** Who is playing: a preset session or custom (Studio/Library) audio. */
export type AudioOwner = "session" | "builder";

/** Lets engine stop fades finish before an idle context is suspended. */
const IDLE_SUSPEND_MS = 1500;
/** How long a fresh start may take to reach "running" before asking for a tap. */
const START_GRACE_MS = 1500;

/** Audio Session API (Safari 16.4+); not in TypeScript's DOM lib yet. */
type NavigatorWithAudioSession = Navigator & { audioSession?: { type: string } };

let ctx: AudioContext | null = null;
const owners = new Set<AudioOwner>();
/** Reached "running" since playback last began: a later pause came from the device. */
let ranSincePlay = false;
let graceExpired = false;
let graceTimer: number | undefined;
let idleTimer: number | undefined;
/** The user paused: automatic resume and the blocked prompt stand down. */
let userPaused = false;
const listeners = new Set<() => void>();
/** The media element owns OS audio focus; only Web Audio carries sound. */
let media: HTMLAudioElement | null = null;
let silentUrl: string | null = null;
let mediaHeld = false;
let mediaAttempt = 0;
let ignoredPauses = 0;
let mediaInfo: {
  title: string;
  scene: string;
  durationSec: number | null;
  position: () => number;
  stop: () => void;
} | null = null;

function setPosition(): void {
  if (!("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return;
  try {
    if (mediaInfo && mediaInfo.durationSec !== null) {
      const duration = mediaInfo.durationSec;
      navigator.mediaSession.setPositionState({
        duration,
        position: Math.max(0, Math.min(duration, mediaInfo.position())),
        playbackRate: 1,
      });
    } else {
      navigator.mediaSession.setPositionState({});
    }
  } catch {
    // Media Session is optional on browsers without position support.
  }
}

function setMediaState(): void {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.playbackState =
      !mediaInfo ? "none" : userPaused || mediaHeld || ctx?.state !== "running" ? "paused" : "playing";
    setPosition();
  } catch {
    // Media Session is optional; never interrupt sound for OS controls.
  }
}

function onMediaPause(): void {
  if (ignoredPauses > 0) {
    ignoredPauses--;
    return;
  }
  if (owners.size === 0 || userPaused || mediaHeld || !media?.paused) return;
  // A pause not requested by SwaraSanti is an OS audio-focus interruption.
  mediaHeld = true;
  ctx?.suspend().catch(() => {});
  setMediaState();
  notify();
}

function ensureMedia(): HTMLAudioElement {
  if (!media) {
    media = document.createElement("audio");
    media.loop = true;
    media.addEventListener("pause", onMediaPause);
    media.style.display = "none";
    document.body.append(media);
  }
  if (!silentUrl) {
    const bytes = createSilentWav();
    silentUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "audio/wav" }));
    media.src = silentUrl;
  }
  return media;
}

function playMedia(): void {
  const element = ensureMedia();
  const attempt = ++mediaAttempt;
  // Do not await: some devices never settle play() without another gesture.
  element.play().catch(() => {
    if (attempt !== mediaAttempt || owners.size === 0 || userPaused || !element.paused) return;
    mediaHeld = true;
    ctx?.suspend().catch(() => {});
    setMediaState();
    notify();
  });
}

function clearMedia(): void {
  mediaInfo = null;
  mediaAttempt++;
  if (media) {
    if (!media.paused) ignoredPauses++;
    media.pause();
    media.removeAttribute("src");
    media.load();
  }
  if (silentUrl) URL.revokeObjectURL(silentUrl);
  silentUrl = null;
  mediaHeld = false;
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.metadata = null;
    for (const action of ["play", "pause", "stop"] as const) {
      navigator.mediaSession.setActionHandler(action, null);
    }
    setMediaState();
  } catch {
    // Browsers without Media Session still play the element.
  }
}

/** Set the Play or Studio preview visible to the OS; cleared when its owner releases audio. */
export function setMediaPresentation(info: NonNullable<typeof mediaInfo>): void {
  mediaInfo = info;
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: info.title,
      artist: "SwaraSanti",
      artwork: [{ src: `/scenes/${info.scene}-768.webp`, sizes: "768x512", type: "image/webp" }],
    });
    navigator.mediaSession.setActionHandler("play", resumeAudio);
    navigator.mediaSession.setActionHandler("pause", pauseAudio);
    navigator.mediaSession.setActionHandler("stop", info.stop);
    setMediaState();
  } catch {
    // Browsers without Media Session still play the element.
  }
}

function notify(): void {
  for (const listener of listeners) listener();
}

function declarePlaybackSession(): void {
  const session = (navigator as NavigatorWithAudioSession).audioSession;
  if (session) session.type = "playback";
}

function tryResume(): void {
  if (!ctx || owners.size === 0 || userPaused || mediaHeld) return;
  if (ctx.state === "running" || ctx.state === "closed") return;
  // Rejected without a user gesture on some browsers; the next one retries.
  ctx.resume().catch(() => {});
}

function onStateChange(): void {
  if (ctx?.state === "running" && owners.size > 0) ranSincePlay = true;
  // A paused context while playing: an interruption that just ended can often
  // be resumed without a gesture, so try at once.
  if (document.visibilityState === "visible") tryResume();
  notify();
  setMediaState();
}

/**
 * Playback (re)starts: a start, or the User resuming. Until the context runs
 * or the grace runs out, a paused context is the normal suspended → running
 * transition, not the device holding the audio.
 */
function startGrace(): void {
  ranSincePlay = ctx?.state === "running";
  graceExpired = false;
  window.clearTimeout(graceTimer);
  graceTimer = window.setTimeout(() => {
    graceExpired = true;
    notify();
  }, START_GRACE_MS);
}

function createContext(): AudioContext {
  // "playback": the largest buffers the device offers. Sessions are long and
  // non-interactive, so latency is irrelevant and underruns (crackles on
  // slow phones) are what matters.
  const created = new AudioContext({ latencyHint: "playback" });
  created.addEventListener("statechange", onStateChange);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tryResume();
  });
  window.addEventListener("pageshow", tryResume);
  window.addEventListener("focus", tryResume);
  // Any tap or key is a user gesture that iOS accepts for resume().
  for (const type of ["pointerdown", "keydown", "touchend"]) {
    window.addEventListener(type, tryResume, { capture: true, passive: true });
  }
  return created;
}

/**
 * The shared context, created and resumed for `owner`. Call synchronously
 * inside the user gesture that starts playback (autoplay policy).
 * Nothing here awaits: a resume() that never settles (seen on iOS) cannot
 * block the start — engines schedule on the paused clock and play once the
 * context runs.
 */
export function acquireAudio(owner: AudioOwner): AudioContext {
  // Before creating the context and on every play: iOS reads it per start.
  declarePlaybackSession();
  ctx ??= createContext();
  window.clearTimeout(idleTimer);
  owners.add(owner);
  userPaused = false;
  startGrace();
  mediaHeld = false;
  playMedia();
  tryResume();
  notify();
  return ctx;
}

/** `owner` stopped playing; suspend the context once nobody plays. */
export function releaseAudio(owner: AudioOwner): void {
  if (!owners.delete(owner)) return;
  if (owners.size === 0) {
    clearMedia();
    userPaused = false;
    window.clearTimeout(graceTimer);
    idleTimer = window.setTimeout(() => {
      if (owners.size === 0 && ctx?.state === "running") ctx.suspend().catch(() => {});
    }, IDLE_SUSPEND_MS);
  }
  notify();
}

/**
 * Pause whatever plays. Suspending the context stops the audio clock, so
 * every scheduled ramp, fade, and session end waits exactly in place.
 */
export function pauseAudio(): void {
  if (!ctx || owners.size === 0) return;
  userPaused = true;
  mediaAttempt++;
  if (media && !media.paused) ignoredPauses++;
  media?.pause();
  setMediaState();
  ctx.suspend().catch(() => {});
  notify();
}

/** Resume after a user or device pause; call from a user gesture. */
export function resumeAudio(): void {
  userPaused = false;
  mediaHeld = false;
  if (ctx && owners.size > 0) {
    startGrace();
    declarePlaybackSession();
    playMedia();
  }
  tryResume();
  setMediaState();
  notify();
}

export function isAudioPaused(): boolean {
  return userPaused;
}

/** True while the audio clock runs: false while paused by the User or held by the device. */
export function isAudioRunning(): boolean {
  return ctx?.state === "running" && !mediaHeld;
}

/**
 * Seconds on the shared audio clock (AudioContext.currentTime), 0 before the
 * first play. It stands still whenever the context does not run, so time on
 * it is time heard.
 */
export function audioClockSec(): number {
  return ctx?.currentTime ?? 0;
}

/**
 * True while audio should be playing but the device holds the context paused
 * and a user gesture is needed. A fresh start gets a grace period, so the
 * normal suspended → running transition never flashes a prompt.
 */
export function isAudioBlocked(): boolean {
  if (!ctx || owners.size === 0 || userPaused) return false;
  return mediaHeld || (ctx.state !== "running" && (ranSincePlay || graceExpired));
}

/** Subscribe to isAudioBlocked()/isAudioPaused() changes (useSyncExternalStore). */
export function subscribeAudio(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
