import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { listAssignmentCounts, listMyPatients, patientName } from "../lib/clinician";
import type { PatientLink } from "../lib/clinician";
import { disconnectPatient } from "../lib/accounts";
import { loadPatientActivity } from "../lib/listening";
import { daysAgo, isKnownTimeZone, localDay, timeZoneLabel } from "../state/listeningReport";
import { PATIENT_STATUSES, needsAttention } from "../state/patientStatus";
import type { PatientActivity, PatientStatus } from "../state/patientStatus";
import { formatDay, formatMinutes, formatTime } from "./listeningFormat";
import { NewPatientForm } from "./NewPatientForm";
import { PatientDetail } from "./PatientDetail";
import { STATUS_NAMES, StatusPill, readStatus } from "./PatientStatusPill";
import type { StatusReading } from "./PatientStatusPill";

/**
 * The Clinician's Patients tab (#12; prototype Variant 2, "Table + drawer"):
 * a table of every Patient with their Patient Status and a week of listening,
 * searched, filtered, sorted and paged in the browser. A row opens the
 * Patient's detail in a drawer that steps through the same filtered, sorted
 * list. The listening columns come from the server's aggregate read (0012);
 * the Listening core derives Patient Status from it. Below 720 px of width
 * the rows become cards; on a phone the drawer is a full-screen sheet.
 */

type SortKey = "attention" | "name" | "last" | "minutes" | "plays" | "stopped" | "premium" | "assigned";
type Dir = 1 | -1;
type StatusFilter = "all" | PatientStatus;

/** One Patient as the table lists them. */
interface Row {
  patient: PatientLink;
  name: string;
  assigned: number;
  /** Null when the aggregate read has no row for them (yet). */
  activity: PatientActivity | null;
  /** Their zone, else this device's: every day and time of the row is on that clock. */
  timeZone: string;
  /** Null when the aggregate read has no row for them (yet). */
  statusReading: StatusReading | null;
  /** Calendar days since their last Play (0 = today); null when they never had one. */
  quietDays: number | null;
}

const SORT_DEFAULT_DIR: Record<SortKey, Dir> = {
  attention: 1,
  name: 1,
  last: -1,
  minutes: -1,
  plays: -1,
  stopped: -1,
  premium: -1,
  assigned: -1,
};

const SORT_LABEL: Record<SortKey, string> = {
  attention: "Needs attention first",
  last: "Last listened",
  name: "Name A–Z",
  minutes: "Most minutes this week",
  plays: "Most Plays this week",
  stopped: "Most stopped this week",
  premium: "Premium first",
  assigned: "Most assigned audio",
};

/** The Sort menu, which also sorts on a phone, where the column headers are hidden. */
const SORT_KEYS: readonly SortKey[] = ["attention", "last", "name", "minutes", "plays", "stopped", "premium", "assigned"];

const PAGE_SIZES = [20, 50, 0] as const; // 0 = all

/** How often an open table reloads, so Patient Status follows the clock. */
const RELOAD_MS = 5 * 60_000;

function toRow(patient: PatientLink, assigned: number, activity: PatientActivity | null, now: number, deviceZone: string): Row {
  // The server keeps only zones the database knows; this browser may still not.
  const timeZone = activity?.timeZone && isKnownTimeZone(activity.timeZone) ? activity.timeZone : deviceZone;
  return {
    patient,
    name: patientName(patient),
    assigned,
    activity,
    timeZone,
    statusReading: activity ? readStatus(activity, now, timeZone) : null,
    quietDays: activity?.lastPlayAt ? daysAgo(activity.lastPlayAt, now, timeZone) : null,
  };
}

function isAttention(r: Row): boolean {
  return r.statusReading !== null && needsAttention(r.statusReading.status);
}

function sortValue(r: Row, key: SortKey): number | string | null {
  switch (key) {
    case "attention":
      // Needs attention first; within each group the longest without a Play
      // first, never-listened before all (no gap reaches 100 000 days).
      if (!r.statusReading) return null;
      return (isAttention(r) ? 0 : 200_000) - (r.quietDays ?? 100_000);
    case "name":
      return r.name.toLowerCase();
    case "last":
      return r.activity?.lastPlayAt ? Date.parse(r.activity.lastPlayAt) : null;
    case "minutes":
      return r.activity?.listenedSec7 ?? null;
    case "plays":
      return r.activity?.plays7 ?? null;
    case "stopped":
      return r.activity?.stopped7 ?? null;
    case "premium":
      return r.patient.premiumGrant ? 1 : 0;
    case "assigned":
      return r.assigned;
  }
}

/** Ascending or descending by `dir`; empty values always sink to the bottom; ties by name. */
function compareRows(a: Row, b: Row, key: SortKey, dir: Dir): number {
  const va = sortValue(a, key);
  const vb = sortValue(b, key);
  if (va === null && vb !== null) return 1;
  if (vb === null && va !== null) return -1;
  if (va !== null && vb !== null && va !== vb) {
    const diff = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
    if (diff !== 0) return dir * diff;
  }
  return a.name.localeCompare(b.name);
}

/** "Today 20:48 WITA" · "Yesterday 22:10 WITA" · "5 days ago" · "Mon 14 Sep" · "Never", on the Patient's clock. */
function lastListened(r: Row, now: number): string {
  const at = r.activity?.lastPlayAt;
  if (!at || r.quietDays === null) return "Never";
  const clock = `${formatTime(at, r.timeZone)} ${timeZoneLabel(r.timeZone, now)}`;
  if (r.quietDays <= 0) return `Today ${clock}`;
  if (r.quietDays === 1) return `Yesterday ${clock}`;
  if (r.quietDays < 7) return `${r.quietDays} days ago`;
  return formatDay(localDay(Date.parse(at), r.timeZone));
}

/** Page numbers to show, with gaps: 1 … 4 5 6 … 12. */
function pageList(current: number, count: number): Array<number | "gap"> {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i);
  const keep = new Set([0, count - 1, current - 1, current, current + 1]);
  const out: Array<number | "gap"> = [];
  for (let i = 0; i < count; i++) {
    if (keep.has(i)) out.push(i);
    else if (out[out.length - 1] !== "gap") out.push("gap");
  }
  return out;
}

export function PatientsTab({
  flash,
  patientLimit,
}: {
  flash: (msg: string) => void;
  /** Most Patients this Clinician may have; null means no limit (the Admin). */
  patientLimit: number | null;
}) {
  const [loaded, setLoaded] = useState<{
    patients: PatientLink[];
    counts: Record<string, number>;
    activity: Map<string, PatientActivity>;
    now: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: Dir }>({ key: "attention", dir: 1 });
  const [pageSize, setPageSize] = useState<number>(20);
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const rowButtons = useRef(new Map<string, HTMLButtonElement>());
  const latestLoad = useRef(0);

  // Reloads overlap (an action while the interval fires): only the latest lands.
  const refresh = useCallback(async () => {
    const load = ++latestLoad.current;
    try {
      const [patients, counts, activity] = await Promise.all([
        listMyPatients(),
        listAssignmentCounts(),
        loadPatientActivity(),
      ]);
      if (load !== latestLoad.current) return;
      setLoaded({ patients, counts, activity, now: Date.now() });
      setError(null);
    } catch {
      if (load === latestLoad.current) setError("Could not load your patients — try again later.");
    }
  }, []);

  // Patient Status depends on the day: a tab open for hours reloads on an
  // interval and when it becomes visible again.
  useEffect(() => {
    void refresh();
    const reload = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = window.setInterval(reload, RELOAD_MS);
    document.addEventListener("visibilitychange", reload);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", reload);
    };
  }, [refresh]);

  const now = loaded?.now ?? 0;
  const rows = useMemo(() => {
    if (!loaded) return [];
    const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return loaded.patients.map((p) =>
      toRow(p, loaded.counts[p.patientId] ?? 0, loaded.activity.get(p.patientId) ?? null, loaded.now, deviceZone),
    );
  }, [loaded]);

  const q = query.trim().toLowerCase().replace(/^@/, "");
  const searched = useMemo(
    () =>
      rows.filter(
        (r) =>
          !q ||
          r.name.toLowerCase().includes(q) ||
          (r.patient.username?.includes(q) ?? false) ||
          (r.patient.email?.toLowerCase().includes(q) ?? false),
      ),
    [rows, q],
  );

  const { statusCounts, attentionCount } = useMemo(() => {
    const counts: Record<PatientStatus, number> = { new: 0, "not-started": 0, quiet: 0, "stops-early": 0, "on-track": 0 };
    for (const r of searched) if (r.statusReading) counts[r.statusReading.status]++;
    return { statusCounts: counts, attentionCount: searched.filter(isAttention).length };
  }, [searched]);

  const sorted = useMemo(
    () =>
      searched
        .filter(
          (r) =>
            (statusFilter === "all" || r.statusReading?.status === statusFilter) && (!attentionOnly || isAttention(r)),
        )
        .sort((a, b) => compareRows(a, b, sort.key, sort.dir)),
    [searched, statusFilter, attentionOnly, sort],
  );

  const pageCount = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const safePage = Math.min(page, pageCount - 1);
  const start = pageSize ? safePage * pageSize : 0;
  const end = pageSize ? Math.min(start + pageSize, sorted.length) : sorted.length;
  const paged = sorted.slice(start, end);

  const openIndex = openId ? sorted.findIndex((r) => r.patient.patientId === openId) : -1;
  const openRow = openId ? (rows.find((r) => r.patient.patientId === openId) ?? null) : null;

  /* "/" focuses the search, unless typing somewhere or the drawer is open. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      const typing = t instanceof HTMLElement && (t.closest("input, textarea, select") !== null || t.isContentEditable);
      if (e.key !== "/" || openId || typing) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  const onSort = (key: SortKey) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: SORT_DEFAULT_DIR[key] }));
    setPage(0);
  };

  const clearFilters = () => {
    setQuery("");
    setStatusFilter("all");
    setAttentionOnly(false);
    setPage(0);
  };

  /** Opens the row at `i` of the sorted list, and turns to its page. */
  const openAt = (i: number) => {
    const r = sorted[i];
    if (!r) return;
    setOpenId(r.patient.patientId);
    if (pageSize) setPage(Math.floor(i / pageSize));
  };

  const closeDrawer = () => {
    const id = openId;
    setOpenId(null);
    requestAnimationFrame(() => ((id && rowButtons.current.get(id)) || searchRef.current)?.focus());
  };

  const disconnect = async (patient: PatientLink) => {
    if (
      !window.confirm(
        `Disconnect ${patientName(patient)}? They keep their account and sign-in, but lose your assigned audio, curation and Premium, and you no longer see their data.`,
      )
    ) {
      return;
    }
    try {
      await disconnectPatient(patient.patientId);
      setOpenId(null);
      await refresh();
      // Their row is gone: focus goes back to the search.
      searchRef.current?.focus();
      flash("Patient disconnected");
    } catch {
      flash("Could not disconnect the patient");
    }
  };

  const onRowKey = (e: ReactKeyboardEvent<HTMLTableSectionElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const id = e.target instanceof HTMLElement ? e.target.dataset.patientId : undefined;
    const i = paged.findIndex((r) => r.patient.patientId === id);
    const next = i < 0 ? undefined : paged[i + (e.key === "ArrowDown" ? 1 : -1)];
    if (!next) return;
    e.preventDefault();
    rowButtons.current.get(next.patient.patientId)?.focus();
  };

  // create-patient enforces the limit on the server; here it only hides the button.
  const total = rows.length;
  const capped = patientLimit !== null && total >= patientLimit;
  const listenedThisWeek = rows.filter((r) => (r.activity?.plays7 ?? 0) > 0).length;

  return (
    <div className="roster">
      <div className="roster-head">
        <div>
          <h2 className="roster-title">Your patients</h2>
          {loaded && (
            <p className="roster-head-sub">
              {rows.filter(isAttention).length} need attention · {listenedThisWeek} listened this week
            </p>
          )}
        </div>
        <div className="roster-head-side">
          <div className={`roster-cap${patientLimit !== null && total >= patientLimit - 2 ? " is-near" : ""}`}>
            <span>
              <strong>
                {total}
                {patientLimit !== null && ` / ${patientLimit}`}
              </strong>{" "}
              {patientLimit === null && total === 1 ? "patient" : "patients"}
            </span>
            {patientLimit !== null && (
              <span className="roster-cap-bar" aria-hidden="true">
                <span style={{ width: `${patientLimit > 0 ? Math.min(100, (total / patientLimit) * 100) : 100}%` }} />
              </span>
            )}
          </div>
          {capped ? (
            <span className="library-note">Patient limit reached — contact us to expand.</span>
          ) : (
            !creating && (
              <button className="chip small roster-primary" onClick={() => setCreating(true)}>
                + New patient
              </button>
            )
          )}
        </div>
      </div>

      {creating && (
        <div className="library-section roster-create">
          <NewPatientForm onCreated={() => void refresh()} onClose={() => setCreating(false)} />
        </div>
      )}

      {error && <p className="library-note">{error}</p>}
      {!error && !loaded && <p className="library-note">Loading your patients…</p>}
      {loaded && total === 0 && <p className="library-note">No patients yet — add one with + New patient.</p>}

      {loaded && total > 0 && (
        <>
          <div className="roster-toolbar">
            <label className="roster-search">
              <span className="roster-search-icon" aria-hidden="true">
                ⌕
              </span>
              <input
                ref={searchRef}
                type="search"
                className="text-input"
                placeholder="Search name, @username or email"
                aria-label="Search patients"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
              />
              {!query && (
                <kbd className="roster-kbd" aria-hidden="true">
                  /
                </kbd>
              )}
            </label>
            <select
              className="select"
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(PATIENT_STATUSES.find((s) => s === e.target.value) ?? "all");
                setPage(0);
              }}
            >
              <option value="all">All statuses ({searched.length})</option>
              {PATIENT_STATUSES.map((s) => (
                <option key={s} value={s} disabled={statusCounts[s] === 0 && statusFilter !== s}>
                  {STATUS_NAMES[s].label} ({statusCounts[s]})
                </option>
              ))}
            </select>
            <button
              className={`chip small roster-attn${attentionOnly ? " selected" : ""}`}
              aria-pressed={attentionOnly}
              onClick={() => {
                setAttentionOnly(!attentionOnly);
                setPage(0);
              }}
            >
              Needs attention only
              <span className="roster-attn-count">{attentionCount}</span>
            </button>
          </div>

          <div className="roster-meta">
            <span className="roster-counter" aria-live="polite">
              {sorted.length === 0 ? (
                "No matches"
              ) : (
                <>
                  Showing{" "}
                  <strong>
                    {start + 1}–{end}
                  </strong>{" "}
                  of <strong>{sorted.length}</strong>
                  {sorted.length < total && <span className="roster-faint"> · filtered from {total}</span>}
                </>
              )}
            </span>
            <div className="roster-meta-end">
              <label className="roster-inline">
                Sort
                <select
                  className="select"
                  value={sort.key}
                  onChange={(e) => {
                    const key = SORT_KEYS.find((k) => k === e.target.value) ?? "attention";
                    setSort({ key, dir: SORT_DEFAULT_DIR[key] });
                    setPage(0);
                  }}
                >
                  {SORT_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {SORT_LABEL[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="roster-inline">
                Rows
                <select
                  className="select"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(0);
                  }}
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n === 0 ? "All" : n}
                    </option>
                  ))}
                </select>
              </label>
              <Pager page={safePage} count={pageCount} onPage={setPage} label="Pages (top)" />
            </div>
          </div>

          <table className="roster-table">
            <caption className="roster-sr">
              Your patients. Column headers sort; select a name to open the details.
            </caption>
            <thead>
              <tr>
                <SortTh k="name" label="Patient" sort={sort} onSort={onSort} className="roster-c-name" />
                <SortTh
                  k="attention"
                  label="Status"
                  sort={sort}
                  onSort={onSort}
                  className="roster-c-status"
                  title="Sort: needs attention first, then longest without a Play"
                />
                <SortTh k="last" label="Last listened" sort={sort} onSort={onSort} className="roster-c-last" />
                <SortTh k="minutes" label="This week" sort={sort} onSort={onSort} className="roster-c-week" />
                <SortTh k="plays" label="Plays 7d" sort={sort} onSort={onSort} className="roster-c-plays" num />
                <SortTh k="stopped" label="Stopped 7d" sort={sort} onSort={onSort} className="roster-c-stopped" num />
                <SortTh k="premium" label="Premium" sort={sort} onSort={onSort} className="roster-c-premium" />
                <SortTh k="assigned" label="Assigned" sort={sort} onSort={onSort} className="roster-c-assigned" num />
              </tr>
            </thead>
            <tbody onKeyDown={onRowKey}>
              {paged.map((r, i) => (
                <PatientRow
                  key={r.patient.patientId}
                  row={r}
                  now={now}
                  open={r.patient.patientId === openId}
                  onOpen={() => openAt(start + i)}
                  buttonRef={(el) => {
                    if (el) rowButtons.current.set(r.patient.patientId, el);
                    else rowButtons.current.delete(r.patient.patientId);
                  }}
                />
              ))}
              {sorted.length === 0 && (
                <tr className="roster-empty-row">
                  <td colSpan={8}>
                    <p>{q ? `No patient matches “${query.trim()}”.` : "No patient matches these filters."}</p>
                    <button className="chip small" onClick={clearFilters}>
                      Clear filters
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="roster-foot">
            <span className="roster-hint">
              <kbd>↑</kbd> <kbd>↓</kbd> move · <kbd>Enter</kbd> open · <kbd>/</kbd> search
            </span>
            <Pager page={safePage} count={pageCount} onPage={setPage} label="Pages (bottom)" />
          </div>
        </>
      )}

      {openRow && (
        <Drawer
          itemId={openRow.patient.patientId}
          label={`${openRow.name} — details`}
          index={openIndex}
          total={sorted.length}
          onStep={(delta) => openAt(openIndex + delta)}
          onClose={closeDrawer}
        >
          <PatientDetail
            key={openRow.patient.patientId}
            patient={openRow.patient}
            statusReading={openRow.statusReading}
            zoneLabel={timeZoneLabel(openRow.timeZone, now)}
            flash={flash}
            onChange={refresh}
            onDisconnect={() => void disconnect(openRow.patient)}
          />
        </Drawer>
      )}
    </div>
  );
}

function PatientRow({
  row: r,
  now,
  open,
  onOpen,
  buttonRef,
}: {
  row: Row;
  now: number;
  open: boolean;
  onOpen: () => void;
  buttonRef: (el: HTMLButtonElement | null) => void;
}) {
  const a = r.activity;
  const sub = r.patient.username ? `@${r.patient.username}` : r.patient.email;
  const faint = <span className="roster-faint">—</span>;
  return (
    <tr
      className={`roster-row${open ? " is-open" : ""}${isAttention(r) ? " is-attn" : ""}`}
      aria-current={open ? "true" : undefined}
      onClick={onOpen}
    >
      <td className="roster-c-name">
        <button className="roster-open" data-patient-id={r.patient.patientId} aria-haspopup="dialog" ref={buttonRef}>
          <span className="roster-name">{r.name}</span>
          {sub && <span className="roster-sub">{sub}</span>}
        </button>
      </td>
      <td className="roster-c-status">
        {r.statusReading ? <StatusPill reading={r.statusReading} short /> : faint}
      </td>
      <td className="roster-c-last">
        {a ? <span className={a.lastPlayAt ? "" : "roster-faint"}>{lastListened(r, now)}</span> : faint}
      </td>
      <td className="roster-c-week">
        {a ? (
          <span className="roster-week">
            <WeekBars dailySec={a.dailySec7} />
            <span className="roster-week-min">{formatMinutes(a.listenedSec7)}</span>
          </span>
        ) : (
          faint
        )}
      </td>
      <td className="roster-c-plays roster-num">{a ? a.plays7 : faint}</td>
      <td className="roster-c-stopped roster-num">
        {a ? <span className={r.statusReading?.status === "stops-early" ? "roster-warn" : ""}>{a.stopped7}</span> : faint}
      </td>
      <td className="roster-c-premium">
        {r.patient.premiumGrant ? (
          <span className="roster-yes">
            <span aria-hidden="true">✓</span>
            <span className="roster-sr">Premium</span>
          </span>
        ) : (
          <span className="roster-faint">
            <span aria-hidden="true">—</span>
            <span className="roster-sr">No Premium</span>
          </span>
        )}
      </td>
      <td className="roster-c-assigned roster-num">{r.assigned}</td>
    </tr>
  );
}

/** Seven tiny bars, oldest day first, each as tall as the minutes heard that day. */
function WeekBars({ dailySec }: { dailySec: number[] }) {
  const minutes = dailySec.map((sec) => Math.round(sec / 60));
  const max = Math.max(30, ...minutes);
  return (
    <span className="week-bars" role="img" aria-label={`Minutes per day, last 7 days: ${minutes.join(", ")}`}>
      {minutes.map((m, i) => (
        <span key={i} className={m > 0 ? "on" : ""} style={{ height: `${Math.max(3, (m / max) * 100)}%` }} />
      ))}
    </span>
  );
}

function SortTh({
  k,
  label,
  sort,
  onSort,
  className,
  num = false,
  title,
}: {
  k: SortKey;
  label: string;
  sort: { key: SortKey; dir: Dir };
  onSort: (k: SortKey) => void;
  className: string;
  num?: boolean;
  title?: string;
}) {
  const active = sort.key === k;
  return (
    <th
      scope="col"
      className={`${className}${num ? " roster-num" : ""}`}
      aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
    >
      <button className="roster-th-btn" onClick={() => onSort(k)} title={title ?? `Sort by ${label.toLowerCase()}`}>
        {label}
        <span className="roster-th-arrow" aria-hidden="true">
          {active ? (sort.dir === 1 ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

function Pager({ page, count, onPage, label }: { page: number; count: number; onPage: (p: number) => void; label: string }) {
  if (count <= 1) return null;
  return (
    <nav className="roster-pager" aria-label={label}>
      <button className="roster-pg" onClick={() => onPage(page - 1)} disabled={page === 0} aria-label="Previous page">
        ‹
      </button>
      {pageList(page, count).map((p, i) =>
        p === "gap" ? (
          <span key={`gap-${i}`} className="roster-pg-gap" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={p}
            className="roster-pg"
            aria-current={p === page ? "page" : undefined}
            aria-label={`Page ${p + 1}`}
            onClick={() => onPage(p)}
          >
            {p + 1}
          </button>
        ),
      )}
      <button
        className="roster-pg"
        onClick={() => onPage(page + 1)}
        disabled={page === count - 1}
        aria-label="Next page"
      >
        ›
      </button>
    </nav>
  );
}

/**
 * The slide-over holding one Patient: Prev/Next through the current list,
 * Escape or the backdrop to close, Tab kept inside while it is open.
 */
function Drawer({
  itemId,
  label,
  index,
  total,
  onStep,
  onClose,
  children,
}: {
  /** Which Patient it shows: a new one starts at the top. */
  itemId: string;
  label: string;
  /** Position of the Patient in the current list; -1 when filtered out of it. */
  index: number;
  total: number;
  onStep: (delta: number) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    bodyRef.current?.scrollTo(0, 0);
  }, [itemId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const nodes = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!panelRef.current.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="roster-drawer-root">
      <div className="roster-backdrop" onClick={onClose} aria-hidden="true" />
      <div ref={panelRef} className="roster-drawer" role="dialog" aria-modal="true" aria-label={label}>
        <header className="roster-drawer-head">
          {index >= 0 ? (
            <div className="roster-stepper">
              <button className="roster-step" onClick={() => onStep(-1)} disabled={index === 0}>
                ‹ Prev
              </button>
              <span className="roster-step-pos" aria-live="polite">
                {index + 1} of {total}
              </span>
              <button className="roster-step" onClick={() => onStep(1)} disabled={index === total - 1}>
                Next ›
              </button>
            </div>
          ) : (
            <span className="roster-step-pos">Not in the current list</span>
          )}
          <div className="roster-drawer-head-end">
            <span className="roster-kbd-hint" aria-hidden="true">
              <kbd>Esc</kbd> to close
            </span>
            <button ref={closeRef} className="roster-drawer-close" onClick={onClose} aria-label="Close details">
              ✕
            </button>
          </div>
        </header>
        <div ref={bodyRef} className="roster-drawer-body">
          {children}
        </div>
      </div>
    </div>,
    // #root is its own stacking context: inside it the drawer stays below the
    // Dashboard's notices.
    document.getElementById("root") ?? document.body,
  );
}
