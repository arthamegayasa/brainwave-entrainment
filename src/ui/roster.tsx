import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import { localDay, timeZoneLabel } from "../state/listeningReport";
import { PATIENT_STATUSES } from "../state/patientStatus";
import type { PatientStatus } from "../state/patientStatus";
import type { ShownRole } from "../../supabase/functions/_shared/accountRules.ts";
import { formatDay, formatTime } from "./listeningFormat";
import { STATUS_NAMES } from "./PatientStatusPill";

/**
 * The table + drawer both people tables share (prototype Variant 2): the
 * Clinician's Patients tab (#12) and the Admin's Clinicians & Patients tab
 * (#13). Loading on the clock lives in `useReloadingLoad`; paging, the drawer
 * with Prev/Next through the current list, keyboard moves and focus return in
 * `useRoster`; the pieces below render the toolbar, the table furniture and
 * the drawer. Styles: `.roster*` in App.css.
 */

export type Dir = 1 | -1;
export type StatusFilter = "all" | PatientStatus;

const PAGE_SIZES = [20, 50, 0] as const; // 0 = all

/** How often an open table reloads, so Patient Status follows the clock. */
const RELOAD_MS = 5 * 60_000;

/** What `useReloadingLoad` holds: the latest load, whether it failed, and a way to load again now. */
export interface ReloadingLoad<T> {
  /** Null until the first load lands. */
  loaded: T | null;
  /** The latest load failed; `loaded` keeps what an earlier one brought. */
  failed: boolean;
  refresh: () => Promise<void>;
}

/**
 * Runs `load` now, every 5 minutes and whenever the tab becomes visible again:
 * Patient Status depends on the day, and a tab can stay open for hours.
 * Loads overlap (an action while the interval fires): only the latest lands.
 * `load` must keep its identity between renders.
 */
export function useReloadingLoad<T>(load: () => Promise<T>): ReloadingLoad<T> {
  const [loaded, setLoaded] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    const current = ++latest.current;
    try {
      const data = await load();
      if (current !== latest.current) return;
      setLoaded(data);
      setFailed(false);
    } catch {
      if (current === latest.current) setFailed(true);
    }
  }, [load]);

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

  return { loaded, failed, refresh };
}

/** Ascending or descending by `dir`; empty values always sink to the bottom; 0 on a tie. */
export function compareSortValues(va: number | string | null, vb: number | string | null, dir: Dir): number {
  if (va === null && vb !== null) return 1;
  if (vb === null && va !== null) return -1;
  if (va === null || vb === null || va === vb) return 0;
  const diff = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
  return dir * diff;
}

/**
 * When someone last listened, on their clock: "Today 20:48 WITA",
 * "Yesterday 22:10 WITA", "5 days ago", "Mon 14 Sep" or "Never".
 */
export function lastListened(
  lastPlayAt: string | null,
  /** Calendar days since that Play in their zone (0 = today); null without one. */
  quietDays: number | null,
  timeZone: string,
  now: number,
): string {
  if (!lastPlayAt || quietDays === null) return "Never";
  const clock = `${formatTime(lastPlayAt, timeZone)} ${timeZoneLabel(timeZone, now)}`;
  if (quietDays <= 0) return `Today ${clock}`;
  if (quietDays === 1) return `Yesterday ${clock}`;
  if (quietDays < 7) return `${quietDays} days ago`;
  return formatDay(localDay(Date.parse(lastPlayAt), timeZone));
}

/** Paging, the open drawer and keyboard moves of a people table, from `useRoster`. */
export interface RosterNav<Row = unknown> {
  /** The page shown, 0-based, within the page count. */
  page: number;
  setPage: (page: number) => void;
  /** Rows per page; 0 shows them all. */
  pageSize: number;
  setPageSize: (size: number) => void;
  pageCount: number;
  /** The shown rows are `start` to `end` (exclusive) of the sorted list. */
  start: number;
  end: number;
  paged: Row[];
  /** The row the drawer shows; null while it is closed. */
  openId: string | null;
  setOpenId: (id: string | null) => void;
  /** Its position in the sorted list; -1 when filtered out of it. */
  openIndex: number;
  /** Opens the row at `i` of the sorted list, and turns to its page. */
  openAt: (i: number) => void;
  closeDrawer: () => void;
  searchRef: RefObject<HTMLInputElement | null>;
  /** The ref of a row's open button, kept by row id for keyboard moves and focus return. */
  rowButtonRef: (id: string) => (el: HTMLButtonElement | null) => void;
  /** Focuses a row's open button, once it is rendered. */
  focusRow: (id: string) => void;
  onRowKey: (e: ReactKeyboardEvent<HTMLTableSectionElement>) => void;
}

/**
 * Paging, the open drawer and keyboard moves over a sorted list of rows:
 * "/" focuses the search, ↑/↓ move between rows, opening a row turns to its
 * page, and closing the drawer returns focus to its row (else to `fallback`,
 * else to the search).
 */
export function useRoster<Row>(
  sorted: Row[],
  idOf: (row: Row) => string,
  fallback?: RefObject<HTMLElement | null>,
): RosterNav<Row> {
  const [pageSize, setPageSize] = useState<number>(20);
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const rowButtons = useRef(new Map<string, HTMLButtonElement>());

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

  const pageCount = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const safePage = Math.min(page, pageCount - 1);
  const start = pageSize ? safePage * pageSize : 0;
  const end = pageSize ? Math.min(start + pageSize, sorted.length) : sorted.length;
  const paged = sorted.slice(start, end);

  const openAt = (i: number) => {
    const row = sorted[i];
    if (row === undefined) return;
    setOpenId(idOf(row));
    if (pageSize) setPage(Math.floor(i / pageSize));
  };

  const closeDrawer = () => {
    const id = openId;
    setOpenId(null);
    requestAnimationFrame(() =>
      ((id && rowButtons.current.get(id)) || fallback?.current || searchRef.current)?.focus(),
    );
  };

  const rowButtonRef = (id: string) => (el: HTMLButtonElement | null) => {
    if (el) rowButtons.current.set(id, el);
    else rowButtons.current.delete(id);
  };

  const focusRow = (id: string) => requestAnimationFrame(() => rowButtons.current.get(id)?.focus());

  const onRowKey = (e: ReactKeyboardEvent<HTMLTableSectionElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const id = e.target instanceof HTMLElement ? e.target.dataset.rowId : undefined;
    const i = paged.findIndex((row) => idOf(row) === id);
    const next = i < 0 ? undefined : paged[i + (e.key === "ArrowDown" ? 1 : -1)];
    if (next === undefined) return;
    e.preventDefault();
    rowButtons.current.get(idOf(next))?.focus();
  };

  return {
    page: safePage,
    setPage,
    pageSize,
    setPageSize,
    pageCount,
    start,
    end,
    paged,
    openId,
    setOpenId,
    openIndex: openId ? sorted.findIndex((row) => idOf(row) === openId) : -1,
    openAt,
    closeDrawer,
    searchRef,
    rowButtonRef,
    focusRow,
    onRowKey,
  };
}

/** The search box, with its "/" shortcut hint while empty. */
export function RosterSearch({
  nav,
  value,
  onChange,
  placeholder,
  label,
}: {
  nav: RosterNav;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <label className="roster-search">
      <span className="roster-search-icon" aria-hidden="true">
        ⌕
      </span>
      <input
        ref={nav.searchRef}
        type="search"
        className="text-input"
        placeholder={placeholder}
        aria-label={label}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          nav.setPage(0);
        }}
      />
      {!value && (
        <kbd className="roster-kbd" aria-hidden="true">
          /
        </kbd>
      )}
    </label>
  );
}

/** The Patient Status filter, each status with how many of the listed Patients have it. */
export function StatusSelect({
  value,
  onChange,
  total,
  counts,
}: {
  value: StatusFilter;
  onChange: (value: StatusFilter) => void;
  /** Patients the "All statuses" option counts. */
  total: number;
  counts: Record<PatientStatus, number>;
}) {
  return (
    <select
      className="select"
      aria-label="Filter by status"
      value={value}
      onChange={(e) => onChange(PATIENT_STATUSES.find((s) => s === e.target.value) ?? "all")}
    >
      <option value="all">All statuses ({total})</option>
      {PATIENT_STATUSES.map((s) => (
        <option key={s} value={s} disabled={counts[s] === 0 && value !== s}>
          {STATUS_NAMES[s].label} ({counts[s]})
        </option>
      ))}
    </select>
  );
}

/** The "Needs attention only" toggle with its count. */
export function AttentionToggle({ on, count, onToggle }: { on: boolean; count: number; onToggle: () => void }) {
  return (
    <button className={`chip small roster-attn${on ? " selected" : ""}`} aria-pressed={on} onClick={onToggle}>
      Needs attention only
      <span className="roster-attn-count">{count}</span>
    </button>
  );
}

/** Showing 1–20 of 28 · filtered from 30, then the Sort menu, the page size and the pages. */
export function RosterMeta<K extends string>({
  nav,
  shown,
  total,
  sortKey,
  sortKeys,
  sortLabel,
  onSortKey,
}: {
  nav: RosterNav;
  /** Rows after filtering. */
  shown: number;
  /** Rows before filtering. */
  total: number;
  sortKey: K;
  /** The Sort menu, which also sorts on a phone, where the column headers are hidden. */
  sortKeys: readonly K[];
  sortLabel: Record<K, string>;
  onSortKey: (key: K) => void;
}) {
  return (
    <div className="roster-meta">
      <span className="roster-counter" aria-live="polite">
        {shown === 0 ? (
          "No matches"
        ) : (
          <>
            Showing{" "}
            <strong>
              {nav.start + 1}–{nav.end}
            </strong>{" "}
            of <strong>{shown}</strong>
            {shown < total && <span className="roster-faint"> · filtered from {total}</span>}
          </>
        )}
      </span>
      <div className="roster-meta-end">
        <label className="roster-inline">
          Sort
          <select
            className="select"
            value={sortKey}
            onChange={(e) => {
              const key = sortKeys.find((k) => k === e.target.value);
              if (key !== undefined) onSortKey(key);
              nav.setPage(0);
            }}
          >
            {sortKeys.map((k) => (
              <option key={k} value={k}>
                {sortLabel[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="roster-inline">
          Rows
          <select
            className="select"
            value={nav.pageSize}
            onChange={(e) => {
              nav.setPageSize(Number(e.target.value));
              nav.setPage(0);
            }}
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "All" : n}
              </option>
            ))}
          </select>
        </label>
        <Pager nav={nav} label="Pages (top)" />
      </div>
    </div>
  );
}

/** The keyboard hints and the pages again, under the table. */
export function RosterFoot({ nav }: { nav: RosterNav }) {
  return (
    <div className="roster-foot">
      <span className="roster-hint">
        <kbd>↑</kbd> <kbd>↓</kbd> move · <kbd>Enter</kbd> open · <kbd>/</kbd> search
      </span>
      <Pager nav={nav} label="Pages (bottom)" />
    </div>
  );
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

function Pager({ nav, label }: { nav: RosterNav; label: string }) {
  const { page, pageCount: count, setPage } = nav;
  if (count <= 1) return null;
  return (
    <nav className="roster-pager" aria-label={label}>
      <button className="roster-pg" onClick={() => setPage(page - 1)} disabled={page === 0} aria-label="Previous page">
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
            onClick={() => setPage(p)}
          >
            {p + 1}
          </button>
        ),
      )}
      <button
        className="roster-pg"
        onClick={() => setPage(page + 1)}
        disabled={page === count - 1}
        aria-label="Next page"
      >
        ›
      </button>
    </nav>
  );
}

export function SortTh<K extends string>({
  k,
  label,
  sort,
  onSort,
  className,
  num = false,
  title,
}: {
  k: K;
  label: string;
  sort: { key: K; dir: Dir };
  onSort: (k: K) => void;
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

/** Seven tiny bars, oldest day first, each as tall as the minutes heard that day. */
export function WeekBars({ dailySec, label }: { dailySec: number[]; label?: string }) {
  const minutes = dailySec.map((sec) => Math.round(sec / 60));
  const max = Math.max(30, ...minutes);
  return (
    <span
      className="week-bars"
      role="img"
      aria-label={label ?? `Minutes per day, last 7 days: ${minutes.join(", ")}`}
    >
      {minutes.map((m, i) => (
        <span key={i} className={m > 0 ? "on" : ""} style={{ height: `${Math.max(3, (m / max) * 100)}%` }} />
      ))}
    </span>
  );
}

const ROLE_NAMES: Record<ShownRole, string> = {
  admin: "Admin",
  clinician: "Clinician",
  patient: "Patient",
  regular: "Regular",
};

/** A badge per role; a person with overlapping roles shows each. */
export function RoleBadges({ roles }: { roles: readonly ShownRole[] }) {
  return (
    <span className="role-badges">
      {roles.map((r) => (
        <span key={r} className={`role-badge role-badge--${r}`}>
          {ROLE_NAMES[r]}
        </span>
      ))}
    </span>
  );
}

/** The Inactive Clinician flag, on their row and on their Patients' rows. */
export function InactivePill({ label = "Inactive" }: { label?: string }) {
  return (
    <span className="inactive-pill" title="Clinician inactive: still has Patients but no longer holds the Clinician role">
      {label}
    </span>
  );
}

/**
 * The slide-over holding one person: Prev/Next through the current list,
 * Escape or the backdrop to close, Tab kept inside while it is open.
 */
export function Drawer({
  itemId,
  label,
  index,
  total,
  onStep,
  onClose,
  children,
}: {
  /** Whom it shows: a new one starts at the top. */
  itemId: string;
  label: string;
  /** Position of the person in the current list; -1 when filtered out of it. */
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
