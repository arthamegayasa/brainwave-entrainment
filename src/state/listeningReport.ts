/**
 * Listening core, aggregations (ADR-017): turns a User's Listening History
 * into the report shown in Account and in the Dashboard. Pure TypeScript —
 * NO React, NO Supabase: `now` and the time zone are passed in. Every day and
 * hour is a calendar day and hour in the Patient's time zone, never the
 * viewer's.
 */

import type { AudioSnapshot, Download, Play } from "./listening";

/** Plays and Downloads of one User, in any order. */
export interface ListeningHistory {
  plays: Play[];
  downloads: Download[];
}

/** How many days the report covers, today included. */
export type ReportDays = 7 | 30;

export interface ReportOptions {
  /** Epoch milliseconds. */
  now: number;
  days: ReportDays;
  /** IANA zone the days and hours are counted in. */
  timeZone: string;
}

export interface ListeningSummary {
  /** Time heard in the period, pauses excluded. */
  listenedSec: number;
  playCount: number;
  /** Plays heard to the end. */
  completedCount: number;
  /** Days of the period with at least one Play. */
  activeDays: number;
  /** Days in a row with a Play, up to today, or up to yesterday while today has none yet. */
  streakDays: number;
  /** Downloads in the period. */
  downloadCount: number;
  /** The same period just before this one, for the trend. */
  previous: { listenedSec: number; playCount: number };
}

export interface HeatmapDay {
  /** Calendar day, "2026-09-26". */
  day: string;
  /** Minutes heard in each hour of that day, 00–01 … 23–24. */
  minutesByHour: number[];
}

/** One audio's Plays in the period. */
export interface AudioStats {
  /** As it read at its latest Play. */
  audio: AudioSnapshot;
  plays: number;
  completed: number;
  stopped: number;
  open: number;
  listenedSec: number;
}

/** One row of the Play log. */
export type LogEntry = { play: Play } | { download: Download };

/** The Plays and Downloads of one day. */
export interface DayGroup {
  /** Calendar day, "2026-09-26". */
  day: string;
  /** Newest first. */
  entries: LogEntry[];
}

/** Hours of the day on the Patient's clock; `toHour` is not included, and is 0 for midnight. */
export interface HourWindow {
  fromHour: number;
  toHour: number;
}

export interface ListeningReport {
  summary: ListeningSummary;
  /** Days of the period, oldest first, ending today. */
  heatmap: HeatmapDay[];
  /** Most played first. */
  perAudio: AudioStats[];
  /** Days of the period with a Play or a Download, newest first. */
  dayGroups: DayGroup[];
  /** The two hours of the day with the most listening in the period; null without Plays. */
  usualWindow: HourWindow | null;
  /** The latest Play of the whole history, also when it is older than the period. */
  lastPlay: Play | null;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Calendar day, hour, minute and second of `instant` on a wall clock in `timeZone`. */
function wallClock(instant: number, timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, f);
  }
  const part: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const { type, value } of f.formatToParts(instant)) part[type] = value;
  return {
    day: `${part.year}-${part.month}-${part.day}`,
    hour: Number(part.hour),
    minute: Number(part.minute),
    second: Number(part.second),
  };
}

/** The calendar day of `instant` in `timeZone`, as "2026-09-26". */
export function localDay(instant: number, timeZone: string): string {
  return wallClock(instant, timeZone).day;
}

/** The calendar day `offset` days after `day` ("2026-09-26", -1 → "2026-09-25"). */
function shiftDay(day: string, offset: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
}

/** First and last calendar day of a period, both included. */
interface Period {
  from: string;
  to: string;
}

function contains(period: Period, day: string): boolean {
  return day >= period.from && day <= period.to;
}

function sum(plays: Play[]): number {
  return plays.reduce((total, p) => total + p.listenedSec, 0);
}

/** The run of days with a Play that ends today, or yesterday while today has none: its first day and length. */
function currentStreak(playDays: Set<string>, today: string): { firstDay: string; days: number } | null {
  let day = playDays.has(today) ? today : shiftDay(today, -1);
  let days = 0;
  while (playDays.has(day)) {
    days++;
    day = shiftDay(day, -1);
  }
  return days === 0 ? null : { firstDay: shiftDay(day, 1), days };
}

/**
 * Whether Plays older than the oldest one given could make the current streak
 * longer: true while the streak starts on that oldest Play's day. The Plays
 * must be every Play from the oldest one given until now.
 */
export function streakMayRunEarlier(plays: Play[], now: number, timeZone: string): boolean {
  if (plays.length === 0) return false;
  const days = plays.map((p) => localDay(Date.parse(p.startedAt), timeZone));
  const streak = currentStreak(new Set(days), localDay(now, timeZone));
  return streak !== null && days.every((day) => day >= streak.firstDay);
}

function isKnownTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The zone a User's times are shown in: that of their latest Play, else of
 * their latest Download; null when they have neither (or only zones this
 * browser does not know).
 */
export function historyTimeZone(history: ListeningHistory): string | null {
  const newestFirst = [
    ...[...history.plays].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)),
    ...[...history.downloads].sort((a, b) => Date.parse(b.downloadedAt) - Date.parse(a.downloadedAt)),
  ];
  return newestFirst.map((entry) => entry.timeZone).find(isKnownTimeZone) ?? null;
}

const INDONESIAN_ZONE_LABELS: Record<string, string> = {
  "Asia/Jakarta": "WIB",
  "Asia/Pontianak": "WIB",
  "Asia/Makassar": "WITA",
  "Asia/Ujung_Pandang": "WITA",
  "Asia/Jayapura": "WIT",
};

/** How times in `timeZone` are labelled at `instant`: WIB, WITA or WIT in Indonesia, else the zone's short name ("GMT+9"). */
export function timeZoneLabel(timeZone: string, instant: number): string {
  if (Object.hasOwn(INDONESIAN_ZONE_LABELS, timeZone)) return INDONESIAN_ZONE_LABELS[timeZone];
  const name = new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "short" })
    .formatToParts(instant)
    .find((part) => part.type === "timeZoneName");
  return name?.value ?? timeZone;
}

/**
 * The report of `history` for the `days` calendar days up to today in
 * `timeZone`, with the same number of days before them for the trend. A Play
 * belongs to the day it started on.
 */
export function listeningReport(history: ListeningHistory, opts: ReportOptions): ListeningReport {
  const { now, days, timeZone } = opts;
  const today = localDay(now, timeZone);
  const current: Period = { from: shiftDay(today, -(days - 1)), to: today };
  const previous: Period = { from: shiftDay(today, -(2 * days - 1)), to: shiftDay(today, -days) };

  const dayOf = (p: Play) => localDay(Date.parse(p.startedAt), timeZone);
  const newestFirst = [...history.plays].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const plays = newestFirst.filter((p) => contains(current, dayOf(p)));
  const previousPlays = newestFirst.filter((p) => contains(previous, dayOf(p)));
  const streak = currentStreak(new Set(newestFirst.map(dayOf)), today);

  const heatmap: HeatmapDay[] = Array.from({ length: days }, (_, i) => ({
    day: shiftDay(current.from, i),
    minutesByHour: Array<number>(24).fill(0),
  }));
  for (const p of plays) {
    // Pauses are not known, so the time heard runs on from the start.
    let at = Date.parse(p.startedAt);
    let remaining = p.listenedSec;
    while (remaining > 0) {
      const clock = wallClock(at, timeZone);
      const chunk = Math.min(remaining, 3600 - clock.minute * 60 - clock.second);
      const row = heatmap.find((r) => r.day === clock.day);
      if (row) row.minutesByHour[clock.hour] += chunk / 60;
      remaining -= chunk;
      at += chunk * 1000;
    }
  }

  // Newest first, so each audio reads as at its latest Play.
  const byAudio = new Map<string, AudioStats>();
  for (const p of plays) {
    const key = `${p.audio.kind}:${p.audio.id}`;
    let stats = byAudio.get(key);
    if (!stats) {
      stats = { audio: p.audio, plays: 0, completed: 0, stopped: 0, open: 0, listenedSec: 0 };
      byAudio.set(key, stats);
    }
    stats.plays++;
    stats[p.outcome]++;
    stats.listenedSec += p.listenedSec;
  }
  const perAudio = [...byAudio.values()].sort(
    (a, b) => b.plays - a.plays || b.listenedSec - a.listenedSec,
  );

  const entries = [
    ...plays.map((play) => ({ at: Date.parse(play.startedAt), entry: { play } })),
    ...history.downloads.map((download) => ({ at: Date.parse(download.downloadedAt), entry: { download } })),
  ]
    .map((e) => ({ ...e, day: localDay(e.at, timeZone) }))
    .filter((e) => contains(current, e.day))
    .sort((a, b) => b.at - a.at);
  const dayGroups: DayGroup[] = [];
  for (const { day, entry } of entries) {
    const last = dayGroups.at(-1);
    if (last?.day === day) last.entries.push(entry);
    else dayGroups.push({ day, entries: [entry] });
  }

  let usualWindow: HourWindow | null = null;
  if (plays.length > 0) {
    const byHour = Array<number>(24).fill(0);
    for (const row of heatmap) row.minutesByHour.forEach((min, hour) => (byHour[hour] += min));
    let best = 0;
    let bestSum = -1;
    for (let hour = 0; hour < 24; hour++) {
      const windowSum = byHour[hour] + byHour[(hour + 1) % 24];
      // On a tie, start in the busier hour: a lone 08:10 reads 08–10, not 07–09.
      if (windowSum > bestSum || (windowSum === bestSum && byHour[hour] > byHour[best])) {
        best = hour;
        bestSum = windowSum;
      }
    }
    usualWindow = { fromHour: best, toHour: (best + 2) % 24 };
  }

  return {
    summary: {
      listenedSec: sum(plays),
      playCount: plays.length,
      completedCount: plays.filter((p) => p.outcome === "completed").length,
      activeDays: new Set(plays.map(dayOf)).size,
      streakDays: streak?.days ?? 0,
      downloadCount: entries.filter((e) => "download" in e.entry).length,
      previous: { listenedSec: sum(previousPlays), playCount: previousPlays.length },
    },
    heatmap,
    perAudio,
    dayGroups,
    usualWindow,
    lastPlay: newestFirst[0] ?? null,
  };
}
