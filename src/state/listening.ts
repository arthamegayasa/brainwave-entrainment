/**
 * Listening core (ADR-017): turns playback into Plays and Downloads for the
 * signed-in User's Listening History. Pure TypeScript — NO React, NO
 * Supabase: the clock, ids and time zone are injected, so the rules are
 * testable without a browser or a backend. The app glue lives in
 * src/lib/listening.ts.
 */

import type { Band, Preset } from "../audio/presets";

/** What was played or downloaded: a Preset, cloud Custom Audio, or a session saved on the device. */
export type AudioKind = "preset" | "custom" | "saved";

/** How the audio read when it was played, so renamed or deleted audio still reads correctly. */
export interface AudioSnapshot {
  kind: AudioKind;
  id: string;
  name: string;
  emoji: string | null;
  band: Band | null;
}

/** Only Presets and Audio Bank Custom Audio have an MP3 export; saved sessions do not. */
export type DownloadAudio = AudioSnapshot & { kind: "preset" | "custom" };

export function presetSnapshot(preset: Preset): DownloadAudio {
  return {
    kind: "preset",
    id: preset.id,
    name: preset.name,
    emoji: preset.emoji,
    band: preset.band,
  };
}

/** Played to the end, stopped before it, or an open-ended (∞) session that has no end. */
export type PlayOutcome = "completed" | "stopped" | "open";

export interface Play {
  /** Generated on the device, so re-sending the same Play is idempotent. */
  id: string;
  audio: AudioSnapshot;
  /** ISO instants. */
  startedAt: string;
  endedAt: string;
  /** Seconds actually heard: pauses excluded. */
  listenedSec: number;
  /** The chosen length; null for an open-ended (∞) session. */
  plannedMin: number | null;
  outcome: PlayOutcome;
  /** The device's IANA time zone, e.g. "Asia/Makassar". */
  timeZone: string;
}

/** One MP3 of a Preset or Custom Audio saved by the User, heard outside the app. */
export interface Download {
  /** Generated on the device, like a Play's. */
  id: string;
  audio: DownloadAudio;
  lengthMin: number;
  /** ISO instant. */
  downloadedAt: string;
  timeZone: string;
}

/** A Play or Download kept on the device until the server has it. */
export type PendingEntry =
  | { userId: string; play: Play }
  | { userId: string; download: Download };

/** Playbacks shorter than this are mis-taps, not Plays. */
export const MIN_PLAY_SEC = 30;

export interface ListeningEnv {
  /** Epoch milliseconds. */
  now: () => number;
  newId: () => string;
  timeZone: () => string;
}

export interface PlayRecorder {
  /** Playback began. Finish any earlier playback first (stop or end). */
  start(audio: AudioSnapshot, plannedMin: number | null): void;
  /** The audio went silent (the User paused, or the device interrupted it). */
  pause(): void;
  /** The audio plays again. */
  resume(): void;
  /**
   * Playback reached its natural end: the Play, or null when there is none.
   * Dated when the whole length had been heard, even when noticed later.
   */
  end(): Play | null;
  /** Playback stopped before its end: the Play, or null when there is none. */
  stop(): Play | null;
}

interface Playback {
  audio: AudioSnapshot;
  plannedMin: number | null;
  startedAt: number;
  /** Heard before the current stretch of playing. */
  playedMs: number;
  /** When the current stretch of playing began; null while paused. */
  playingSince: number | null;
  /** When the whole planned length had been heard; null until then. */
  heardAllAt: number | null;
}

/** Close the current stretch of playing at `until`, noting when the whole length was heard. */
function closeStretch(p: Playback, until: number): void {
  if (p.playingSince === null) return;
  const stretchMs = Math.max(0, until - p.playingSince);
  const plannedMs = p.plannedMin === null ? null : p.plannedMin * 60_000;
  if (plannedMs !== null && p.heardAllAt === null && p.playedMs + stretchMs >= plannedMs) {
    p.heardAllAt = p.playingSince + (plannedMs - p.playedMs);
  }
  p.playedMs += stretchMs;
  p.playingSince = null;
}

export function createPlayRecorder(env: ListeningEnv): PlayRecorder {
  let current: Playback | null = null;

  return {
    start(audio, plannedMin) {
      const now = env.now();
      current = {
        audio,
        plannedMin,
        startedAt: now,
        playedMs: 0,
        playingSince: now,
        heardAllAt: null,
      };
    },

    pause() {
      if (current) closeStretch(current, env.now());
    },

    resume() {
      if (!current || current.playingSince !== null) return;
      current.playingSince = env.now();
    },

    end() {
      return finish(true);
    },

    stop() {
      return finish(false);
    },
  };

  function finish(naturalEnd: boolean): Play | null {
    const playback = current;
    current = null;
    if (!playback) return null;
    const now = env.now();
    closeStretch(playback, now);
    const plannedSec = playback.plannedMin === null ? null : playback.plannedMin * 60;
    // Hearing the whole length is the natural end, even when a stop came
    // first because nobody noticed the end (a tab held in the background).
    const completed = plannedSec !== null && (naturalEnd || playback.heardAllAt !== null);
    const listenedSec = completed ? plannedSec : Math.floor(playback.playedMs / 1000);
    if (listenedSec < MIN_PLAY_SEC) return null;
    // Never before the start, even if the device clock was set back meanwhile.
    const endedAt = Math.max(completed ? (playback.heardAllAt ?? now) : now, playback.startedAt);
    return {
      id: env.newId(),
      audio: playback.audio,
      startedAt: new Date(playback.startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      listenedSec,
      plannedMin: playback.plannedMin,
      outcome: plannedSec === null ? "open" : completed ? "completed" : "stopped",
      timeZone: env.timeZone(),
    };
  }
}

/** The part of localStorage the queue needs. */
export interface QueueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ListeningQueue {
  /** Keep a Play or Download on the device until a flush delivers it. */
  enqueue(entry: PendingEntry): void;
  /**
   * Send the User's pending entries. Flushes run one at a time, an entry
   * leaves the device only once the server has it, and a failed send keeps
   * it, with the same id, for the next flush. Never rejects.
   */
  flush(userId: string): Promise<void>;
}

const QUEUE_KEY = "serenade.listening.queue.v1";

function entryId(entry: PendingEntry): string {
  return "play" in entry ? entry.play.id : entry.download.id;
}

/** Entries read back from storage: enough shape to send, drop, and never crash on. */
function isPendingEntry(value: unknown): value is PendingEntry {
  if (typeof value !== "object" || value === null || !("userId" in value)) return false;
  const item = "play" in value ? value.play : "download" in value ? value.download : null;
  return (
    typeof value.userId === "string" &&
    typeof item === "object" &&
    item !== null &&
    "id" in item &&
    typeof item.id === "string"
  );
}

/**
 * The offline queue: Plays and Downloads wait in `storage` (localStorage),
 * so they survive a reload, until `send` delivers them. `storage` null keeps
 * them in memory for this visit only.
 */
export function createListeningQueue(opts: {
  storage: QueueStorage | null;
  send: (entries: PendingEntry[]) => Promise<void>;
}): ListeningQueue {
  const { storage, send } = opts;
  let memory: PendingEntry[] = [];
  /** The latest flush: the next one runs after it, so flushes never overlap. */
  let lastFlush = Promise.resolve();

  function read(): PendingEntry[] {
    if (!storage) return memory;
    try {
      const parsed: unknown = JSON.parse(storage.getItem(QUEUE_KEY) ?? "[]");
      return Array.isArray(parsed) ? parsed.filter(isPendingEntry) : [];
    } catch {
      return [];
    }
  }

  function write(entries: PendingEntry[]): void {
    if (!storage) {
      memory = entries;
      return;
    }
    try {
      storage.setItem(QUEUE_KEY, JSON.stringify(entries));
    } catch {
      /* storage full or blocked: the entry is lost, playback is unaffected */
    }
  }

  async function sendPending(userId: string): Promise<void> {
    const batch = read().filter((e) => e.userId === userId);
    if (batch.length === 0) return;
    try {
      await send(batch);
    } catch {
      return; // still queued; the next flush re-sends the same ids
    }
    const sent = new Set(batch.map(entryId));
    // Re-read: entries queued while the request was in flight stay.
    write(read().filter((e) => !sent.has(entryId(e))));
  }

  return {
    enqueue(entry) {
      write([...read(), entry]);
    },

    flush(userId) {
      lastFlush = lastFlush.then(() => sendPending(userId));
      return lastFlush;
    },
  };
}
