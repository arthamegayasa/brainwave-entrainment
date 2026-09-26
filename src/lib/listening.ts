import { supabase } from "./supabase";
import { createListeningQueue, createPlayRecorder, SendError } from "../state/listening";
import type {
  AudioKind,
  AudioSnapshot,
  Download,
  DownloadAudio,
  ListeningEnv,
  PendingEntry,
  Play,
  PlayOutcome,
} from "../state/listening";
import { historyTimeZone, streakMayRunEarlier } from "../state/listeningReport";
import type { ListeningHistory } from "../state/listeningReport";
import type { PatientActivity } from "../state/patientStatus";
import type { Band } from "../audio/presets";

/**
 * Listening History on the server (ADR-017). Plays and Downloads of the
 * signed-in User wait in the offline queue of the Listening core
 * (src/state/listening.ts) and go to the `plays` / `downloads` tables (0011)
 * right away, or once the device is back online. Signed out, nothing leaves
 * the device. The playback paths reach this module through their thin
 * adapters (src/ui/playAdapters.ts). `loadListeningHistory` reads a history
 * back for the report (src/state/listeningReport.ts, src/ui/ListeningReport.tsx);
 * `loadPatientActivity` reads the aggregates of the Dashboard's Patients table.
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
 * take them (offline, signed out, rejected), with the HTTP status, so the
 * queue keeps them or sets aside the ones no retry can fix.
 */
async function send(entries: PendingEntry[]): Promise<void> {
  if (!supabase) throw new Error("Listening History needs Supabase");
  // A flush sends one User's entries. Under another User's session the
  // server would reject them for good (403), though they are fine: keep
  // them queued until their User is signed in again.
  const { data } = await supabase.auth.getSession();
  if (data.session?.user.id !== entries[0]?.userId) throw new Error("Signed in as another User");
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
    const { error, status } = await supabase
      .from(table)
      .upsert(rows, { onConflict: "id", ignoreDuplicates: true });
    // A 4xx body that is not PostgREST's JSON (a proxy's page) carries no code.
    if (error) throw new SendError(status, error.code ?? "", error.message);
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

/* ── Reading a Listening History ───────────────────────────────────────── */

interface SnapshotRow {
  audio_kind: AudioKind;
  audio_id: string;
  audio_name: string;
  audio_emoji: string | null;
  audio_band: Band | null;
}

interface PlayRow extends SnapshotRow {
  id: string;
  started_at: string;
  ended_at: string;
  listened_sec: number;
  planned_min: number | null;
  outcome: PlayOutcome;
  time_zone: string;
}

interface DownloadRow extends SnapshotRow {
  audio_kind: "preset" | "custom";
  id: string;
  length_min: number;
  downloaded_at: string;
  time_zone: string;
}

const SNAPSHOT_COLUMNS = "audio_kind, audio_id, audio_name, audio_emoji, audio_band";
const PLAY_COLUMNS = `id, ${SNAPSHOT_COLUMNS}, started_at, ended_at, listened_sec, planned_min, outcome, time_zone`;
const DOWNLOAD_COLUMNS = `id, ${SNAPSHOT_COLUMNS}, length_min, downloaded_at, time_zone`;

function snapshotFromRow<K extends AudioKind>(row: SnapshotRow & { audio_kind: K }): AudioSnapshot & { kind: K } {
  return {
    kind: row.audio_kind,
    id: row.audio_id,
    name: row.audio_name,
    emoji: row.audio_emoji,
    band: row.audio_band,
  };
}

function playFromRow(row: PlayRow): Play {
  return {
    id: row.id,
    audio: snapshotFromRow(row),
    startedAt: row.started_at,
    endedAt: row.ended_at,
    listenedSec: row.listened_sec,
    plannedMin: row.planned_min,
    outcome: row.outcome,
    timeZone: row.time_zone,
  };
}

/** Rows per request, within PostgREST's row cap. */
const PAGE_ROWS = 500;
/** A 30-day report and the 30 days before it, plus a day for time zones. */
const REPORT_WINDOW_MS = 61 * 86_400_000;

/**
 * `userId`'s rows of `table`, newest first, a page at a time until `enough`
 * is satisfied by the rows so far or none are left.
 */
async function newestRows<Row>(
  table: string,
  columns: string,
  timeColumn: keyof Row & string,
  userId: string,
  enough: (rows: Row[]) => boolean,
): Promise<Row[]> {
  if (!supabase) throw new Error("Listening History needs Supabase");
  const rows: Row[] = [];
  for (;;) {
    let query = supabase
      .from(table)
      .select(columns)
      .eq("user_id", userId)
      .order(timeColumn, { ascending: false })
      .limit(PAGE_ROWS);
    const oldest = rows.at(-1);
    if (oldest) query = query.lt(timeColumn, oldest[timeColumn]);
    const { data, error } = await query;
    if (error) throw error;
    const page = data as unknown as Row[];
    rows.push(...page);
    if (page.length < PAGE_ROWS || enough(rows)) return rows;
  }
}

/**
 * `userId`'s Listening History, as much as the report needs: every Play and
 * Download of the last 61 days, and earlier Plays while they may lengthen the
 * current streak. Row-level security decides whose history can be read: one's
 * own, a linked Patient's for their Clinician, anyone's for the Admin.
 */
export async function loadListeningHistory(userId: string, now: number): Promise<ListeningHistory> {
  const since = now - REPORT_WINDOW_MS;
  const [playRows, downloadRows] = await Promise.all([
    newestRows<PlayRow>("plays", PLAY_COLUMNS, "started_at", userId, (rows) => {
      if (Date.parse(rows[rows.length - 1].started_at) >= since) return false;
      const plays = rows.map(playFromRow);
      const timeZone = historyTimeZone({ plays, downloads: [] });
      return timeZone === null || !streakMayRunEarlier(plays, now, timeZone);
    }),
    newestRows<DownloadRow>(
      "downloads",
      DOWNLOAD_COLUMNS,
      "downloaded_at",
      userId,
      (rows) => Date.parse(rows[rows.length - 1].downloaded_at) < since,
    ),
  ]);
  return {
    plays: playRows.map(playFromRow),
    downloads: downloadRows.map(
      (row): Download => ({
        id: row.id,
        audio: snapshotFromRow(row),
        lengthMin: row.length_min,
        downloadedAt: row.downloaded_at,
        timeZone: row.time_zone,
      }),
    ),
  };
}

/** One User's account creation and week of listening, as patient_activity() and user_overview() return them. */
export interface ActivityRow {
  account_created_at: string;
  last_play_at: string | null;
  time_zone: string | null;
  plays_7d: number;
  stopped_7d: number;
  listened_sec_7d: number;
  daily_listened_sec: number[];
}

/** Those columns as the Listening core reads them. */
export function activityFromRow(row: ActivityRow): PatientActivity {
  return {
    accountCreatedAt: row.account_created_at,
    lastPlayAt: row.last_play_at,
    timeZone: row.time_zone,
    plays7: row.plays_7d,
    stopped7: row.stopped_7d,
    listenedSec7: row.listened_sec_7d,
    dailySec7: row.daily_listened_sec,
  };
}

/**
 * The aggregates of the signed-in Clinician's Patients (0012), by Patient id:
 * what the Patients table shows and Patient Status is derived from, without
 * downloading their Plays. Another Clinician's Patients never appear.
 */
export async function loadPatientActivity(): Promise<Map<string, PatientActivity>> {
  if (!supabase) throw new Error("Listening History needs Supabase");
  const { data, error } = await supabase.rpc("patient_activity");
  if (error) throw error;
  return new Map(
    (data as Array<ActivityRow & { patient_id: string }>).map((row) => [row.patient_id, activityFromRow(row)]),
  );
}
