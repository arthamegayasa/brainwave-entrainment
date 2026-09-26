import { supabase } from "./supabase";
import { createListeningQueue, createPlayRecorder } from "../state/listening";
import type {
  AudioSnapshot,
  DownloadAudio,
  ListeningEnv,
  PendingEntry,
  Play,
} from "../state/listening";

/**
 * Listening History on the server (ADR-017). Plays and Downloads of the
 * signed-in User wait in the offline queue of the Listening core
 * (src/state/listening.ts) and go to the `plays` / `downloads` tables (0011)
 * right away, or once the device is back online. Signed out, nothing leaves
 * the device. The playback paths reach this module through their thin
 * adapters (src/ui/playAdapters.ts).
 */

/**
 * A random (v4) UUID. crypto.randomUUID() exists only in secure contexts;
 * getRandomValues() also works on a phone testing the dev server over http.
 */
function uuid(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** The device's clock, ids and time zone, for the Listening core. */
export const listeningEnv: ListeningEnv = {
  now: Date.now,
  newId: uuid,
  timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
};

function snapshotColumns(audio: AudioSnapshot) {
  return {
    audio_kind: audio.kind,
    audio_id: audio.id,
    audio_name: audio.name,
    audio_emoji: audio.emoji,
    audio_band: audio.band,
  };
}

/**
 * Insert the entries; a re-sent id conflicts and is ignored, so a retry after
 * a lost response never makes a second row. Throws when the server did not
 * take them (offline, signed out), which keeps them queued.
 */
async function send(entries: PendingEntry[]): Promise<void> {
  if (!supabase) throw new Error("Listening History needs Supabase");
  const plays = entries.flatMap((e) =>
    "play" in e
      ? [
          {
            id: e.play.id,
            user_id: e.userId,
            ...snapshotColumns(e.play.audio),
            started_at: e.play.startedAt,
            ended_at: e.play.endedAt,
            listened_sec: e.play.listenedSec,
            planned_min: e.play.plannedMin,
            outcome: e.play.outcome,
            time_zone: e.play.timeZone,
          },
        ]
      : [],
  );
  const downloads = entries.flatMap((e) =>
    "download" in e
      ? [
          {
            id: e.download.id,
            user_id: e.userId,
            ...snapshotColumns(e.download.audio),
            length_min: e.download.lengthMin,
            downloaded_at: e.download.downloadedAt,
            time_zone: e.download.timeZone,
          },
        ]
      : [],
  );
  const tables: Array<[string, Array<Record<string, unknown>>]> = [
    ["plays", plays],
    ["downloads", downloads],
  ];
  for (const [table, rows] of tables) {
    if (rows.length === 0) continue;
    const { error } = await supabase
      .from(table)
      .upsert(rows, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw error;
  }
}

function deviceStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

const storage = deviceStorage();
const queue = createListeningQueue({ storage, send });
const USER_KEY = "serenade.listening.user.v1";

function readStoredUser(): string | null {
  try {
    return storage?.getItem(USER_KEY) ?? null;
  } catch {
    return null;
  }
}

/**
 * The User whose session this device holds. Kept in storage because a cold
 * start offline with an expired access token reports no session (the token
 * cannot be refreshed), although the session stays until a real sign-out.
 */
let userId: string | null = readStoredUser();

function setUser(id: string | null): void {
  userId = id;
  try {
    if (id) storage?.setItem(USER_KEY, id);
    else storage?.removeItem(USER_KEY);
  } catch {
    /* storage blocked: followed in memory for this visit */
  }
}

function flush(): void {
  if (userId) void queue.flush(userId);
}

function keep(owner: string | null, play: Play | null): void {
  if (!play || !owner) return;
  queue.enqueue({ userId: owner, play });
  flush();
}

export interface HistoryRecorder {
  start(audio: AudioSnapshot, plannedMin: number | null): void;
  pause(): void;
  resume(): void;
  /** Natural end: the Play, if any, goes to the Listening History. */
  end(): void;
  /** Stopped before the end: the Play, if any, goes to the Listening History. */
  stop(): void;
}

/**
 * A Play recorder of the Listening core whose Plays go to the Listening
 * History of the User signed in when the playback started, even if they
 * sign out or someone else signs in before it ends. Signed out at the start,
 * it records nothing: listening stays on the device.
 */
export function createHistoryRecorder(): HistoryRecorder {
  const recorder = createPlayRecorder(listeningEnv);
  let owner: string | null = null;
  return {
    start(audio, plannedMin) {
      keep(owner, recorder.stop());
      owner = userId;
      recorder.start(audio, plannedMin);
    },
    pause: recorder.pause,
    resume: recorder.resume,
    end: () => keep(owner, recorder.end()),
    stop: () => keep(owner, recorder.stop()),
  };
}

/** Keep an MP3 Download of `audio`, `lengthMin` long, in the signed-in User's Listening History. */
export function recordDownload(audio: DownloadAudio, lengthMin: number): void {
  if (!userId) return;
  queue.enqueue({
    userId,
    download: {
      id: listeningEnv.newId(),
      audio,
      lengthMin,
      downloadedAt: new Date(listeningEnv.now()).toISOString(),
      timeZone: listeningEnv.timeZone(),
    },
  });
  flush();
}

/**
 * Follow the signed-in User and send what the queue holds on start (the first
 * auth event), when the device comes back online, and when the app becomes
 * visible again. Returns the cleanup.
 */
export function startListeningSync(): () => void {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (session) setUser(session.user.id);
    else if (event === "SIGNED_OUT") setUser(null);
    // Supabase must not be called from inside its auth callback (deadlock).
    window.setTimeout(flush, 0);
  });
  const onVisible = () => {
    if (document.visibilityState === "visible") flush();
  };
  window.addEventListener("online", flush);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    data.subscription.unsubscribe();
    window.removeEventListener("online", flush);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
