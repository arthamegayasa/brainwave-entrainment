import { describe, it, expect } from "vitest";
import { historyTimeZone, listeningReport, streakMayRunEarlier, timeZoneLabel } from "../src/state/listeningReport";
import type { AudioSnapshot, Download, Play, PlayOutcome } from "../src/state/listening";

const SLEEPING: AudioSnapshot = { kind: "preset", id: "sleeping", name: "Sleeping", emoji: "🌙", band: "delta" };

const WIB = "Asia/Jakarta";
const WITA = "Asia/Makassar";

let seq = 0;

/** A Play that started at `at` (an ISO instant with its offset) and was heard for `min` minutes without pauses. */
function play(
  at: string,
  min: number,
  opts: { audio?: AudioSnapshot; outcome?: PlayOutcome; plannedMin?: number | null; timeZone?: string } = {},
): Play {
  const startedAt = Date.parse(at);
  const outcome = opts.outcome ?? "completed";
  return {
    id: `play-${++seq}`,
    audio: opts.audio ?? SLEEPING,
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date(startedAt + min * 60_000).toISOString(),
    listenedSec: min * 60,
    plannedMin: outcome === "open" ? null : (opts.plannedMin ?? min),
    outcome,
    timeZone: opts.timeZone ?? WIB,
  };
}

/** Saturday 26 September 2026, 21:30 WIB (22:30 WITA). */
const NOW = Date.parse("2026-09-26T21:30:00+07:00");

describe("Listening report summary", () => {
  it("counts the last 7 days up to today, and the 7 days before them for the trend", () => {
    const plays = [
      play("2026-09-26T21:00:00+07:00", 30), // today
      play("2026-09-20T22:00:00+07:00", 15, { outcome: "stopped", plannedMin: 30 }), // 6 days ago
      play("2026-09-19T22:00:00+07:00", 20), // 7 days ago: the previous period
      play("2026-09-12T22:00:00+07:00", 45), // 14 days ago: neither
    ];
    const { summary } = listeningReport({ plays, downloads: [] }, { now: NOW, days: 7, timeZone: WIB });
    expect(summary).toMatchObject({
      listenedSec: 45 * 60,
      playCount: 2,
      completedCount: 1,
      activeDays: 2,
      previous: { listenedSec: 20 * 60, playCount: 1 },
    });
  });

  it("counts days in the Patient's zone: 23:30 WIB is already the next day in WITA", () => {
    // Saturday 19 Sep 23:30 WIB = Sunday 20 Sep 00:30 WITA: the day before the
    // last 7 in WIB, the first of them in WITA.
    const plays = [play("2026-09-19T23:30:00+07:00", 30)];
    const history = { plays, downloads: [] };
    const wib = listeningReport(history, { now: NOW, days: 7, timeZone: WIB }).summary;
    const wita = listeningReport(history, { now: NOW, days: 7, timeZone: WITA }).summary;
    expect(wib).toMatchObject({ playCount: 0, previous: { playCount: 1 } });
    expect(wita).toMatchObject({ playCount: 1, activeDays: 1, previous: { playCount: 0 } });
  });

  it("a 30-day report compares with the 30 days before it", () => {
    const plays = [
      play("2026-08-28T08:00:00+07:00", 10), // 29 days ago: the first day of the last 30
      play("2026-08-27T08:00:00+07:00", 20), // 30 days ago: previous period
      play("2026-07-28T08:00:00+07:00", 40), // 60 days ago: neither
    ];
    const { summary } = listeningReport({ plays, downloads: [] }, { now: NOW, days: 30, timeZone: WIB });
    expect(summary).toMatchObject({
      listenedSec: 10 * 60,
      playCount: 1,
      previous: { listenedSec: 20 * 60, playCount: 1 },
    });
  });

  it("the streak counts days in a row with a Play up to today, or up to yesterday while today has none yet", () => {
    const upToToday = [
      play("2026-09-26T07:00:00+07:00", 30),
      play("2026-09-25T22:00:00+07:00", 30),
      play("2026-09-25T07:00:00+07:00", 30),
      play("2026-09-24T22:00:00+07:00", 30),
      play("2026-09-22T22:00:00+07:00", 30), // after a day without a Play
    ];
    const opts = { now: NOW, days: 7, timeZone: WIB } as const;
    expect(listeningReport({ plays: upToToday, downloads: [] }, opts).summary.streakDays).toBe(3);
    expect(listeningReport({ plays: upToToday.slice(1), downloads: [] }, opts).summary.streakDays).toBe(2);
    expect(listeningReport({ plays: upToToday.slice(3), downloads: [] }, opts).summary.streakDays).toBe(0);
  });

  it("the streak follows the Patient's days: 23:30 WIB on Thursday is Friday in WITA", () => {
    const plays = [
      play("2026-09-26T20:00:00+07:00", 30), // Saturday
      play("2026-09-24T23:30:00+07:00", 30), // Thursday in WIB, Friday 00:30 in WITA
    ];
    const history = { plays, downloads: [] };
    expect(listeningReport(history, { now: NOW, days: 7, timeZone: WIB }).summary.streakDays).toBe(1);
    expect(listeningReport(history, { now: NOW, days: 7, timeZone: WITA }).summary.streakDays).toBe(2);
  });
});

describe("Listening report heatmap", () => {
  it("has one row per day of the period, oldest first, ending today", () => {
    const { heatmap } = listeningReport({ plays: [], downloads: [] }, { now: NOW, days: 7, timeZone: WIB });
    expect(heatmap.map((row) => row.day)).toEqual([
      "2026-09-20",
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
      "2026-09-25",
      "2026-09-26",
    ]);
    expect(heatmap[0].minutesByHour).toHaveLength(24);
  });

  it("places the time heard in the hours it was heard, across midnight, in the Patient's zone", () => {
    // 40 minutes from Thursday 23:40 WIB = Friday 00:40 WITA.
    const plays = [play("2026-09-24T23:40:00+07:00", 40)];
    const history = { plays, downloads: [] };
    const wib = listeningReport(history, { now: NOW, days: 7, timeZone: WIB }).heatmap;
    const wita = listeningReport(history, { now: NOW, days: 7, timeZone: WITA }).heatmap;

    const cells = (rows: typeof wib) =>
      rows.flatMap((row) => row.minutesByHour.flatMap((min, hour) => (min > 0 ? [[row.day, hour, min]] : [])));
    expect(cells(wib)).toEqual([
      ["2026-09-24", 23, 20],
      ["2026-09-25", 0, 20],
    ]);
    expect(cells(wita)).toEqual([
      ["2026-09-25", 0, 20],
      ["2026-09-25", 1, 20],
    ]);
  });

  it("leaves out Plays that started before the period, even when they ran into it", () => {
    // Started 23:50 on the day before the last 7; its minutes after midnight belong to it.
    const plays = [play("2026-09-19T23:50:00+07:00", 30)];
    const { heatmap } = listeningReport({ plays, downloads: [] }, { now: NOW, days: 7, timeZone: WIB });
    expect(heatmap.every((row) => row.minutesByHour.every((min) => min === 0))).toBe(true);
  });
});

const FOCUS: AudioSnapshot = { kind: "preset", id: "focus", name: "Focus", emoji: "🎯", band: "beta" };
const DEEP_REST: AudioSnapshot = { kind: "custom", id: "c-1", name: "Deep Rest", emoji: "🌊", band: "delta" };

describe("Listening report per audio", () => {
  it("splits each audio's Plays into played to the end, stopped early and open-ended, most played first", () => {
    const plays = [
      play("2026-09-26T08:00:00+07:00", 10, { audio: FOCUS, outcome: "stopped", plannedMin: 30 }),
      play("2026-09-25T21:00:00+07:00", 30),
      play("2026-09-25T08:00:00+07:00", 30, { audio: FOCUS }),
      play("2026-09-24T21:00:00+07:00", 12, { outcome: "stopped", plannedMin: 30 }),
      play("2026-09-23T21:00:00+07:00", 50, { outcome: "open" }),
      play("2026-09-23T06:00:00+07:00", 30, { audio: DEEP_REST }),
      play("2026-09-10T21:00:00+07:00", 30, { audio: DEEP_REST }), // before the period
    ];
    const { perAudio } = listeningReport({ plays, downloads: [] }, { now: NOW, days: 7, timeZone: WIB });
    expect(perAudio).toEqual([
      { audio: SLEEPING, plays: 3, completed: 1, stopped: 1, open: 1, listenedSec: 92 * 60 },
      { audio: FOCUS, plays: 2, completed: 1, stopped: 1, open: 0, listenedSec: 40 * 60 },
      { audio: DEEP_REST, plays: 1, completed: 1, stopped: 0, open: 0, listenedSec: 30 * 60 },
    ]);
  });

  it("names renamed audio as it read at its latest Play, and keeps a Preset and Custom Audio with one id apart", () => {
    const renamed = { ...DEEP_REST, name: "Deep Rest for Ivan" };
    const presetWithSameId: AudioSnapshot = { ...SLEEPING, id: "c-1" };
    const plays = [
      play("2026-09-26T06:00:00+07:00", 30, { audio: renamed }),
      play("2026-09-25T06:00:00+07:00", 30, { audio: DEEP_REST }),
      play("2026-09-24T21:00:00+07:00", 30, { audio: presetWithSameId }),
    ];
    const { perAudio } = listeningReport({ plays, downloads: [] }, { now: NOW, days: 7, timeZone: WIB });
    expect(perAudio.map((s) => [s.audio.name, s.plays])).toEqual([
      ["Deep Rest for Ivan", 2],
      ["Sleeping", 1],
    ]);
  });

  it("counts Plays on the Patient's days: 23:30 WIB before the period is inside it in WITA", () => {
    const plays = [play("2026-09-19T23:30:00+07:00", 30, { audio: FOCUS })];
    const perAudio = (timeZone: string) =>
      listeningReport({ plays, downloads: [] }, { now: NOW, days: 7, timeZone }).perAudio;
    expect(perAudio(WIB)).toEqual([]);
    expect(perAudio(WITA)).toEqual([
      { audio: FOCUS, plays: 1, completed: 1, stopped: 0, open: 0, listenedSec: 30 * 60 },
    ]);
  });
});

/** A Download of `audio` at `at`. */
function download(at: string, audio: AudioSnapshot & { kind: "preset" | "custom" } = { ...SLEEPING, kind: "preset" }): Download {
  return {
    id: `download-${++seq}`,
    audio,
    lengthMin: 30,
    downloadedAt: new Date(Date.parse(at)).toISOString(),
    timeZone: WIB,
  };
}

describe("Listening report day groups", () => {
  it("groups the period's Plays and Downloads by the Patient's day, newest first", () => {
    const late = play("2026-09-25T23:30:00+07:00", 30); // Saturday 00:30 in WITA
    const evening = play("2026-09-25T20:00:00+07:00", 30);
    const saved = download("2026-09-25T21:15:00+07:00");
    const morning = play("2026-09-26T07:00:00+07:00", 30);
    const old = download("2026-09-01T21:15:00+07:00"); // before the period
    const history = { plays: [evening, morning, late], downloads: [old, saved] };

    const entryIds = (groups: { day: string; entries: ({ play: Play } | { download: Download })[] }[]) =>
      groups.map((g) => [g.day, g.entries.map((e) => ("play" in e ? e.play.id : e.download.id))]);

    const wib = listeningReport(history, { now: NOW, days: 7, timeZone: WIB });
    expect(entryIds(wib.dayGroups)).toEqual([
      ["2026-09-26", [morning.id]],
      ["2026-09-25", [late.id, saved.id, evening.id]],
    ]);
    expect(wib.summary.downloadCount).toBe(1);

    const wita = listeningReport(history, { now: NOW, days: 7, timeZone: WITA });
    expect(entryIds(wita.dayGroups)).toEqual([
      ["2026-09-26", [morning.id, late.id]],
      ["2026-09-25", [saved.id, evening.id]],
    ]);
  });
});

describe("Listening report usual listening window", () => {
  const window = (plays: Play[], timeZone = WIB) =>
    listeningReport({ plays, downloads: [] }, { now: NOW, days: 7, timeZone }).usualWindow;

  it("is the two hours with the most listening, in the Patient's zone", () => {
    const plays = [
      play("2026-09-25T21:10:00+07:00", 30),
      play("2026-09-24T22:00:00+07:00", 30),
      play("2026-09-23T08:00:00+07:00", 15),
    ];
    expect(window(plays)).toEqual({ fromHour: 21, toHour: 23 });
    expect(window(plays, WITA)).toEqual({ fromHour: 22, toHour: 0 });
  });

  it("starts in the busier hour when two windows tie", () => {
    const plays = [play("2026-09-25T08:10:00+07:00", 30), play("2026-09-24T08:05:00+07:00", 30)];
    expect(window(plays)).toEqual({ fromHour: 8, toHour: 10 });
  });

  it("runs across midnight", () => {
    const plays = [play("2026-09-25T23:30:00+07:00", 60), play("2026-09-23T23:30:00+07:00", 60)];
    expect(window(plays)).toEqual({ fromHour: 23, toHour: 1 });
  });

  it("is null without Plays in the period; one Play is enough", () => {
    expect(window([])).toBeNull();
    expect(window([play("2026-09-25T08:35:00+07:00", 30)])).toEqual({ fromHour: 8, toHour: 10 });
  });
});

describe("Listening report for a sparse history", () => {
  it("with nothing in the period, still knows the latest Play", () => {
    const latest = play("2026-09-14T21:00:00+07:00", 30);
    const plays = [play("2026-09-02T21:00:00+07:00", 30), latest];
    const report = listeningReport({ plays, downloads: [] }, { now: NOW, days: 7, timeZone: WIB });
    expect(report.summary.playCount).toBe(0);
    expect(report.dayGroups).toEqual([]);
    expect(report.perAudio).toEqual([]);
    expect(report.lastPlay?.id).toBe(latest.id);
  });

  it("never listened: no latest Play", () => {
    const report = listeningReport({ plays: [], downloads: [] }, { now: NOW, days: 30, timeZone: WIB });
    expect(report.lastPlay).toBeNull();
    expect(report.summary).toMatchObject({ playCount: 0, streakDays: 0, previous: { playCount: 0 } });
  });
});

describe("the Patient's time zone", () => {
  it("is the zone of the latest Play, else of the latest Download", () => {
    const inBali = play("2026-09-26T08:00:00+08:00", 30, { timeZone: WITA });
    const inJakarta = play("2026-09-20T08:00:00+07:00", 30, { timeZone: WIB });
    expect(historyTimeZone({ plays: [inJakarta, inBali], downloads: [] })).toBe(WITA);

    const downloads = [
      { ...download("2026-09-20T08:00:00+07:00"), timeZone: "Asia/Jayapura" },
      { ...download("2026-09-10T08:00:00+07:00"), timeZone: WIB },
    ];
    expect(historyTimeZone({ plays: [], downloads })).toBe("Asia/Jayapura");
    expect(historyTimeZone({ plays: [], downloads: [] })).toBeNull();
  });

  it("skips a zone the device reported but this browser does not know", () => {
    const plays = [
      play("2026-09-26T08:00:00+07:00", 30, { timeZone: "Mars/Olympus_Mons" }),
      play("2026-09-25T08:00:00+07:00", 30, { timeZone: WIB }),
    ];
    expect(historyTimeZone({ plays, downloads: [] })).toBe(WIB);
  });

  it("reads WIB, WITA or WIT in Indonesia, and the zone's own short name elsewhere", () => {
    expect(timeZoneLabel("Asia/Jakarta", NOW)).toBe("WIB");
    expect(timeZoneLabel("Asia/Pontianak", NOW)).toBe("WIB");
    expect(timeZoneLabel("Asia/Makassar", NOW)).toBe("WITA");
    expect(timeZoneLabel("Asia/Jayapura", NOW)).toBe("WIT");
    expect(timeZoneLabel("Asia/Tokyo", NOW)).toBe("GMT+9");
    expect(timeZoneLabel("UTC", NOW)).toBe("UTC");
  });
});

describe("loading enough Plays for the streak", () => {
  it("asks for earlier Plays only while the streak starts on the day of the oldest Play loaded", () => {
    const opts = [NOW, WIB] as const;
    const run = [play("2026-09-26T08:00:00+07:00", 30), play("2026-09-25T08:00:00+07:00", 30)];
    expect(streakMayRunEarlier(run, ...opts)).toBe(true);
    expect(streakMayRunEarlier([...run, play("2026-09-23T08:00:00+07:00", 30)], ...opts)).toBe(false);
    expect(streakMayRunEarlier([play("2026-09-23T08:00:00+07:00", 30)], ...opts)).toBe(false);
    expect(streakMayRunEarlier([], ...opts)).toBe(false);
  });
});
