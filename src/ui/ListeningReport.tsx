import { Fragment, useEffect, useId, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { AudioSnapshot, Download, Play } from "../state/listening";
import { historyTimeZone, listeningReport, localDay, timeZoneLabel } from "../state/listeningReport";
import type {
  AudioStats,
  DayGroup,
  HeatmapDay,
  HourWindow,
  ListeningHistory,
  ReportDays,
} from "../state/listeningReport";
import { loadListeningHistory } from "../lib/listening";
import { BAND_COLORS, BAND_LABELS } from "./bands";
import { formatDay, formatMinutes, formatTime } from "./listeningFormat";

/**
 * The Listening History report (ADR-017; prototype Variant A, "Report"): a
 * summary line with the 7 / 30 day toggle, four stat tiles, a days × hours
 * heatmap, per-audio bars and the Play log with Downloads. Every time is in
 * the Patient's most recent time zone, labelled WIB, WITA or WIT. It sits in
 * the Account sheet (about 500 px) and in the Dashboard patient detail, and
 * adapts to its own width through container queries (App.css, `.lr`).
 */

interface ListeningReportProps {
  /** Whose Listening History. */
  userId: string;
  /** The person's first name; null when it is the viewer's own history ("You"). */
  firstName: string | null;
  /** Level of the report's own headings, one below the heading it sits under. */
  headingLevel: 4 | 5;
}

type Loaded = { history: ListeningHistory; now: number } | "error";

/** How often an open report reloads, so "today" and new Plays follow the clock. */
const RELOAD_MS = 5 * 60_000;

export function ListeningReport({ userId, firstName, headingLevel }: ListeningReportProps) {
  const [loaded, setLoaded] = useState<{ userId: string; result: Loaded } | null>(null);
  // A tab can stay open for hours: reload on an interval and when it becomes visible again.
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    const reload = () => {
      if (document.visibilityState === "visible") setReloads((n) => n + 1);
    };
    const timer = window.setInterval(reload, RELOAD_MS);
    document.addEventListener("visibilitychange", reload);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", reload);
    };
  }, []);

  useEffect(() => {
    let live = true;
    const now = Date.now();
    loadListeningHistory(userId, now).then(
      (history) => live && setLoaded({ userId, result: { history, now } }),
      // A failed reload keeps the report already shown.
      () => live && setLoaded((prev) => (prev?.userId === userId && prev.result !== "error" ? prev : { userId, result: "error" })),
    );
    return () => {
      live = false;
    };
  }, [userId, reloads]);

  const result = loaded?.userId === userId ? loaded.result : null;
  if (result === null) return <p className="library-note">Loading listening history…</p>;
  if (result === "error") {
    return <p className="library-note">Could not load the listening history. Try again later.</p>;
  }
  return <Report history={result.history} now={result.now} firstName={firstName} headingLevel={headingLevel} />;
}

/* ── Formatting (always on the Patient's clock) ──────────────────────── */

const LOG_PREVIEW = 8;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatWindow(w: HourWindow): string {
  return `${pad2(w.fromHour)}:00–${pad2(w.toHour)}:00`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function bandStyle(audio: AudioSnapshot): CSSProperties | undefined {
  return audio.band ? ({ "--lr-band": BAND_COLORS[audio.band] } as CSSProperties) : undefined;
}

/* ── Report ──────────────────────────────────────────────────────────── */

function Report({
  history,
  now,
  firstName,
  headingLevel,
}: {
  history: ListeningHistory;
  now: number;
  firstName: string | null;
  headingLevel: 4 | 5;
}) {
  const [days, setDays] = useState<ReportDays>(7);
  const timeZone = useMemo(
    () => historyTimeZone(history) ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    [history],
  );
  const zoneLabel = timeZoneLabel(timeZone, now);
  const report = useMemo(() => listeningReport(history, { now, days, timeZone }), [history, now, days, timeZone]);
  // Offer the 30 days only when they hold a Play the 7 days do not.
  const monthHasPlays = useMemo(
    () => days === 7 && listeningReport(history, { now, days: 30, timeZone }).summary.playCount > 0,
    [history, now, days, timeZone],
  );

  const { summary, perAudio, heatmap, dayGroups, usualWindow, lastPlay } = report;
  const self = firstName === null;
  const subject = firstName ?? "You";
  const top = perAudio[0] ?? null;
  const minDiff = Math.round((summary.listenedSec - summary.previous.listenedSec) / 60);
  const playDiff = summary.playCount - summary.previous.playCount;
  const logEntries = dayGroups.reduce((n, group) => n + group.entries.length, 0);
  // Both a Dashboard and an Account report can be on screen at once.
  const ids = useId();
  const Heading = headingLevel === 4 ? "h4" : "h5";

  return (
    <section className="lr" aria-label="Listening report">
      <div className="lr-head">
        <p className="lr-lede">
          {summary.activeDays === 0 ? (
            <>
              {self ? "You haven't" : `${firstName} hasn't`} listened in the <strong>last {days} days</strong>
            </>
          ) : (
            <>
              {subject} listened{" "}
              <strong>
                {summary.activeDays === days
                  ? `every day of the last ${days} days`
                  : `on ${summary.activeDays} of the last ${days} days`}
              </strong>
              {usualWindow && (
                <span className="lr-lede-window">
                  <span aria-hidden="true"> · </span>
                  <span className="lr-sr">, </span>
                  usually <strong>{formatWindow(usualWindow)}</strong> <span className="lr-tz">{zoneLabel}</span>
                </span>
              )}
            </>
          )}
        </p>
        <div className="lr-range" role="group" aria-label="Time range">
          {([7, 30] as const).map((d) => (
            <button
              key={d}
              type="button"
              className={`lr-range-btn${days === d ? " lr-range-btn--on" : ""}`}
              aria-pressed={days === d}
              onClick={() => setDays(d)}
            >
              {d} days
            </button>
          ))}
        </div>
      </div>

      <div className="lr-tiles">
        <div className="lr-tile">
          <p className="lr-tile-label">Listening time</p>
          <p className="lr-tile-value">
            <Measure text={formatMinutes(summary.listenedSec)} />
          </p>
          <Trend diff={minDiff} text={formatMinutes(Math.abs(minDiff) * 60)} days={days} />
        </div>
        <div className="lr-tile">
          <p className="lr-tile-label">Plays</p>
          <p className="lr-tile-value">
            <span className="lr-num">{summary.playCount}</span>
            {summary.playCount > 0 && <span className="lr-unit"> · {summary.completedCount} to the end</span>}
          </p>
          <Trend diff={playDiff} text={String(Math.abs(playDiff))} days={days} />
        </div>
        <div className="lr-tile">
          <p className="lr-tile-label">Streak</p>
          <p className="lr-tile-value">
            <Measure text={plural(summary.streakDays, "day")} />
          </p>
          <p className="lr-tile-note">
            {summary.streakDays > 0 && "in a row · "}
            {summary.activeDays} of {days} days active
          </p>
        </div>
        <div className="lr-tile lr-tile--top" style={top ? bandStyle(top.audio) : undefined}>
          <p className="lr-tile-label">Most played</p>
          {top ? (
            <>
              <p className="lr-tile-audio">
                <AudioEmoji audio={top.audio} />
                <span>{top.audio.name}</span>
              </p>
              <p className="lr-tile-note">
                <strong>{top.plays}×</strong> · {formatMinutes(top.listenedSec)}
              </p>
            </>
          ) : (
            <>
              <p className="lr-tile-value">
                <span className="lr-num lr-num--muted">—</span>
              </p>
              <p className="lr-tile-note">Nothing played yet</p>
            </>
          )}
        </div>
      </div>

      {summary.playCount === 0 ? (
        // Never listened, or not in this period: the tiles stay, one calm message replaces the charts.
        <div className="lr-card lr-empty">
          <svg className="lr-empty-art" viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r="30" className="lr-empty-ring" />
            <path d="M38 18a15 15 0 1 0 8 26 13 13 0 0 1-8-26z" className="lr-empty-moon" />
            <circle cx="20" cy="20" r="1.6" className="lr-empty-star" />
            <circle cx="46" cy="16" r="1.2" className="lr-empty-star" />
            <circle cx="16" cy="40" r="1" className="lr-empty-star" />
          </svg>
          <p className="lr-empty-title">{lastPlay ? `No listening in the last ${days} days` : "No listening yet"}</p>
          <p className="lr-empty-body">
            {lastPlay
              ? `${self ? "Your" : `${firstName}'s`} last Play was on ${formatDay(
                  localDay(Date.parse(lastPlay.startedAt), timeZone),
                )}.`
              : self
                ? "Start any session and it shows up here: when you listened, for how long, and what."
                : `Plays appear here as soon as ${firstName} starts a session.`}
          </p>
          {monthHasPlays && (
            <button type="button" className="lr-more" onClick={() => setDays(30)}>
              Show the last 30 days
            </button>
          )}
        </div>
      ) : (
        <>
          <section className="lr-card" aria-labelledby={`${ids}-when`}>
            <header className="lr-card-head">
              <Heading id={`${ids}-when`} className="lr-card-title">
                When {self ? "you listen" : `${firstName} listens`}
              </Heading>
              <p className="lr-card-sub">Each square is one hour · darker = more minutes</p>
            </header>
            <Heatmap
              rows={heatmap}
              zoneLabel={zoneLabel}
              summary={`${subject} listened on ${summary.activeDays} of the last ${days} days${
                usualWindow ? `, usually ${formatWindow(usualWindow)} ${zoneLabel}` : ""
              }.${peakSentence(heatmap)}`}
              hint={
                usualWindow
                  ? `Most listening ${formatWindow(usualWindow)} ${zoneLabel} · hover or tap a square`
                  : "Hover or tap a square for details"
              }
            />
          </section>

          <section className="lr-card" aria-labelledby={`${ids}-audio`}>
            <header className="lr-card-head">
              <Heading id={`${ids}-audio`} className="lr-card-title">
                Audio played
              </Heading>
              <p className="lr-card-sub">
                {plural(perAudio.length, "audio")} · {plural(summary.playCount, "Play")}
              </p>
            </header>
            <AudioBars stats={perAudio} />
          </section>
        </>
      )}

      {logEntries > 0 && (
        <section className="lr-card" aria-labelledby={`${ids}-log`}>
          <header className="lr-card-head">
            <Heading id={`${ids}-log`} className="lr-card-title">
              Plays &amp; downloads
            </Heading>
            <p className="lr-card-sub">
              Newest first · times in {zoneLabel}
              {summary.downloadCount > 0 && ` · ${plural(summary.downloadCount, "download")}`}
            </p>
          </header>
          <PlayLog key={days} groups={dayGroups} total={logEntries} timeZone={timeZone} zoneLabel={zoneLabel} />
        </section>
      )}
    </section>
  );
}

/** The busiest hour of the period, for screen readers; "" without listening. */
function peakSentence(rows: HeatmapDay[]): string {
  let peak = { day: "", hour: 0, min: 0 };
  for (const row of rows) {
    for (let hour = 0; hour < 24; hour++) {
      const min = row.minutesByHour[hour];
      if (min >= 0.5 && min > peak.min) peak = { day: row.day, hour, min };
    }
  }
  if (peak.day === "") return "";
  return ` The busiest hour was ${formatDay(peak.day)} at ${pad2(peak.hour)}:00 with ${Math.round(peak.min)} minutes.`;
}

/** "1 h 35 min" with large numerals and small units. */
function Measure({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(\d+)/)
        .filter(Boolean)
        .map((part, i) => (
          <span key={i} className={/^\d+$/.test(part) ? "lr-num" : "lr-unit"}>
            {part}
          </span>
        ))}
    </>
  );
}

/** The change against the previous period; `text` is its size without a sign. */
function Trend({ diff, text, days }: { diff: number; text: string; days: ReportDays }) {
  const dir = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
  return (
    <p className={`lr-trend lr-trend--${dir}`}>
      <span className="lr-trend-icon" aria-hidden="true">
        {dir === "up" ? "▲" : dir === "down" ? "▼" : "="}
      </span>
      <span className="lr-trend-value">{dir === "flat" ? "No change" : `${dir === "up" ? "+" : "−"}${text}`}</span>
      <span className="lr-trend-vs">vs previous {days} days</span>
    </p>
  );
}

function AudioEmoji({ audio }: { audio: AudioSnapshot }) {
  return (
    <span className="lr-emoji" aria-hidden="true">
      {audio.emoji ?? "♪"}
    </span>
  );
}

/* ── Heatmap ─────────────────────────────────────────────────────────── */

/** How dark a square is for the minutes heard in that hour. */
function level(min: number): 0 | 1 | 2 | 3 | 4 {
  if (min < 0.5) return 0;
  if (min < 15) return 1;
  if (min < 30) return 2;
  if (min < 45) return 3;
  return 4;
}

function Heatmap({ rows, zoneLabel, summary, hint }: { rows: HeatmapDay[]; zoneLabel: string; summary: string; hint: string }) {
  const [readout, setReadout] = useState<string | null>(null);
  const month = rows.length > 7;

  return (
    <div className={`lr-heat${month ? " lr-heat--month" : ""}`}>
      <p className="lr-sr">{summary}</p>
      <div
        className="lr-heat-grid"
        role="group"
        aria-label={`Listening by day and hour, times in ${zoneLabel}`}
        onMouseLeave={() => setReadout(null)}
      >
        <span className="lr-heat-tz" aria-hidden="true">
          {zoneLabel}
        </span>
        {["00", "06", "12"].map((h) => (
          <span key={h} className="lr-heat-hour" aria-hidden="true">
            {h}
          </span>
        ))}
        <span className="lr-heat-hour lr-heat-hour--last" aria-hidden="true">
          <span>18</span>
          <span>24</span>
        </span>

        {rows.map((row, i) => {
          const today = i === rows.length - 1;
          const monday = new Date(`${row.day}T12:00:00Z`).getUTCDay() === 1;
          const weekBreak = monday && i > 0 ? " lr-wk" : "";
          const dayText = formatDay(row.day);
          return (
            <Fragment key={row.day}>
              <span className={`lr-heat-day${today ? " lr-heat-day--today" : ""}${weekBreak}`} aria-hidden="true">
                {!month || monday || today || i === 0 ? dayText.split(" ").slice(0, 2).join(" ") : ""}
              </span>
              {row.minutesByHour.map((min, hour) => {
                const lv = level(min);
                const label = `${dayText}${today ? " (today)" : ""} · ${pad2(hour)}:00–${pad2(hour + 1)}:00 ${zoneLabel} · ${
                  lv > 0 ? `${Math.max(1, Math.round(min))} min` : "no listening"
                }`;
                return (
                  <span
                    key={hour}
                    role="img"
                    aria-label={label}
                    title={label}
                    tabIndex={lv > 0 ? 0 : -1}
                    className={`lr-cell lr-cell--l${lv}${hour % 6 === 0 && hour > 0 ? " lr-cell--q" : ""}${weekBreak}`}
                    onMouseEnter={() => setReadout(label)}
                    onFocus={() => setReadout(label)}
                    onBlur={() => setReadout(null)}
                  />
                );
              })}
            </Fragment>
          );
        })}
      </div>

      <div className="lr-heat-foot">
        <p className={`lr-heat-readout${readout ? " lr-heat-readout--on" : ""}`} aria-live="polite">
          {readout ?? hint}
        </p>
        <div className="lr-heat-legend" aria-hidden="true">
          <span>0</span>
          {[0, 1, 2, 3, 4].map((lv) => (
            <span key={lv} className={`lr-cell lr-cell--l${lv}`} />
          ))}
          <span>60 min</span>
        </div>
      </div>
    </div>
  );
}

/* ── Per-audio bars ──────────────────────────────────────────────────── */

function AudioBars({ stats }: { stats: AudioStats[] }) {
  const max = Math.max(1, ...stats.map((s) => s.plays));
  return (
    <>
      <ul className="lr-bars">
        {stats.map((s) => {
          const split = [
            s.completed > 0 && `${s.completed} to the end`,
            s.stopped > 0 && `${s.stopped} stopped early`,
            s.open > 0 && `${s.open} open-ended`,
          ].filter(Boolean);
          return (
            <li key={`${s.audio.kind}:${s.audio.id}`} className="lr-bars-row" style={bandStyle(s.audio)}>
              <div className="lr-bars-name">
                <AudioEmoji audio={s.audio} />
                <span className="lr-bars-title">
                  {s.audio.name}
                  {s.audio.band && (
                    <>
                      <span className="lr-band-dot" title={BAND_LABELS[s.audio.band]} aria-hidden="true" />
                      <span className="lr-sr">, {BAND_LABELS[s.audio.band]}</span>
                    </>
                  )}
                </span>
                <span className="lr-bars-split">{split.join(" · ")}</span>
              </div>
              <div className="lr-bars-track" aria-hidden="true">
                <div className="lr-bars-fill" style={{ width: `${(s.plays / max) * 100}%` }}>
                  {s.completed > 0 && <span className="lr-seg lr-seg--completed" style={{ flexGrow: s.completed }} />}
                  {s.open > 0 && <span className="lr-seg lr-seg--open" style={{ flexGrow: s.open }} />}
                  {s.stopped > 0 && <span className="lr-seg lr-seg--stopped" style={{ flexGrow: s.stopped }} />}
                </div>
              </div>
              <div className="lr-bars-total">
                <strong>{s.plays}×</strong>
                <span aria-hidden="true"> · </span>
                <span className="lr-sr">, total </span>
                {formatMinutes(s.listenedSec)}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="lr-bars-legend" aria-hidden="true">
        <span>
          <i className="lr-seg lr-seg--completed" /> Played to the end
        </span>
        <span>
          <i className="lr-seg lr-seg--stopped" /> Stopped early
        </span>
        <span>
          <i className="lr-seg lr-seg--open" /> Open-ended ∞
        </span>
      </div>
    </>
  );
}

/* ── Play log ────────────────────────────────────────────────────────── */

function outcomeText(play: Play): string {
  if (play.outcome === "completed") return "Played to the end";
  if (play.outcome === "open") return "Open-ended session";
  return `Stopped at ${Math.round(play.listenedSec / 60)} of ${play.plannedMin} min`;
}

const OUTCOME_ICONS: Record<Play["outcome"], string> = { completed: "✓", stopped: "◼", open: "∞" };

function AudioCell({ audio }: { audio: AudioSnapshot }) {
  return (
    <span className="lr-audio" style={bandStyle(audio)}>
      <AudioEmoji audio={audio} />
      <span>{audio.name}</span>
      {audio.band && <span className="lr-band-dot" title={BAND_LABELS[audio.band]} aria-hidden="true" />}
    </span>
  );
}

function PlayLog({
  groups,
  total,
  timeZone,
  zoneLabel,
}: {
  groups: DayGroup[];
  total: number;
  timeZone: string;
  zoneLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const rows = groups.flatMap((group) =>
    group.entries.map((entry, i) => ({ day: group.day, firstOfDay: i === 0, entry })),
  );
  const shown = expanded ? rows : rows.slice(0, LOG_PREVIEW);

  return (
    <>
      <table className="lr-log">
        <caption className="lr-sr">Plays and downloads, newest first, times in {zoneLabel}</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Time · {zoneLabel}</th>
            <th scope="col">Audio</th>
            <th scope="col">Listened</th>
            <th scope="col">Outcome</th>
          </tr>
        </thead>
        <tbody>
          {shown.map(({ day, firstOfDay, entry }, i) => {
            const row: LogRowProps = { day, firstOfDay, newDay: firstOfDay && i > 0, timeZone, zoneLabel };
            return "download" in entry ? (
              <DownloadRow key={entry.download.id} download={entry.download} {...row} />
            ) : (
              <PlayRow key={entry.play.id} play={entry.play} {...row} />
            );
          })}
        </tbody>
      </table>
      {total > LOG_PREVIEW && (
        <button type="button" className="lr-more" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          {expanded ? "Show fewer" : `Show all ${total}`}
        </button>
      )}
    </>
  );
}

interface LogRowProps {
  /** The Patient's day the entry belongs to. */
  day: string;
  /** The day's first row: the day shows; later rows of the day only read it out. */
  firstOfDay: boolean;
  /** A day's first row below another day. */
  newDay: boolean;
  timeZone: string;
  zoneLabel: string;
}

function DayCell({ day, firstOfDay }: LogRowProps) {
  return (
    <td className={`lr-td-day${firstOfDay ? "" : " lr-td-day--repeat"}`}>
      <span className="lr-day-text">{formatDay(day)}</span>
    </td>
  );
}

function PlayRow({ play, ...row }: LogRowProps & { play: Play }) {
  const { day, timeZone, zoneLabel } = row;
  const endsNextDay = localDay(Date.parse(play.endedAt), timeZone) !== day;
  const heard = play.plannedMin ? Math.min(1, play.listenedSec / 60 / play.plannedMin) : 1;
  return (
    <tr className={`lr-row lr-row--play${row.newDay ? " lr-row--newday" : ""}`}>
      <DayCell {...row} />
      <td className="lr-td-time">
        {formatTime(play.startedAt, timeZone)}–{formatTime(play.endedAt, timeZone)}
        {endsNextDay && (
          <sup className="lr-nextday" title="Ended the next day">
            +1
          </sup>
        )}{" "}
        <span className="lr-tz">{zoneLabel}</span>
      </td>
      <td className="lr-td-audio">
        <AudioCell audio={play.audio} />
      </td>
      <td className="lr-td-listened">
        <span className="lr-listened">{formatMinutes(play.listenedSec)}</span>
        <span className={`lr-meter lr-meter--${play.outcome}`} style={bandStyle(play.audio)} aria-hidden="true">
          <span style={{ width: `${heard * 100}%` }} />
        </span>
      </td>
      <td className="lr-td-outcome">
        <span className={`lr-outcome lr-outcome--${play.outcome}`}>
          <span className="lr-outcome-icon" aria-hidden="true">
            {OUTCOME_ICONS[play.outcome]}
          </span>
          {outcomeText(play)}
        </span>
      </td>
    </tr>
  );
}

function DownloadRow({ download, ...row }: LogRowProps & { download: Download }) {
  const { timeZone, zoneLabel } = row;
  return (
    <tr className={`lr-row lr-row--download${row.newDay ? " lr-row--newday" : ""}`}>
      <DayCell {...row} />
      <td className="lr-td-time">
        {formatTime(download.downloadedAt, timeZone)} <span className="lr-tz">{zoneLabel}</span>
      </td>
      <td className="lr-td-audio">
        <AudioCell audio={download.audio} />
      </td>
      <td className="lr-td-dl" colSpan={2}>
        <span className="lr-dl">
          <span className="lr-dl-icon" aria-hidden="true">
            ⬇
          </span>
          Downloaded MP3 · {download.lengthMin} min
        </span>
      </td>
    </tr>
  );
}
