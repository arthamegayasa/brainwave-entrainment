import { useMemo, useState } from "react";
import { listAssignmentCounts, listMyPatients, patientName } from "../lib/clinician";
import type { PatientLink } from "../lib/clinician";
import { disconnectPatient } from "../lib/accounts";
import { loadPatientActivity } from "../lib/listening";
import { daysAgo, isKnownTimeZone, timeZoneLabel } from "../state/listeningReport";
import { needsAttention } from "../state/patientStatus";
import type { PatientActivity, PatientStatus } from "../state/patientStatus";
import { rolesOf } from "../../supabase/functions/_shared/accountRules.ts";
import { formatMinutes } from "./listeningFormat";
import { NewPatientForm } from "./NewPatientForm";
import { PatientDetail } from "./PatientDetail";
import { StatusPill, readStatus } from "./PatientStatusPill";
import type { StatusReading } from "./PatientStatusPill";
import {
  AttentionToggle,
  Drawer,
  RosterFoot,
  RosterMeta,
  RosterSearch,
  SortTh,
  StatusSelect,
  WeekBars,
  compareSortValues,
  lastListened,
  useReloadingLoad,
  useRoster,
} from "./roster";
import type { Dir, StatusFilter } from "./roster";

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

const SORT_KEYS: readonly SortKey[] = ["attention", "last", "name", "minutes", "plays", "stopped", "premium", "assigned"];

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

/** By `key` in `dir`, empty values last, ties by name. */
function compareRows(a: Row, b: Row, key: SortKey, dir: Dir): number {
  return compareSortValues(sortValue(a, key), sortValue(b, key), dir) || a.name.localeCompare(b.name);
}

/** Everything the table shows, read at one moment. */
async function loadPatients() {
  const [patients, counts, activity] = await Promise.all([
    listMyPatients(),
    listAssignmentCounts(),
    loadPatientActivity(),
  ]);
  return { patients, counts, activity, now: Date.now() };
}

export function PatientsTab({
  flash,
  patientLimit,
  adminId,
}: {
  flash: (msg: string) => void;
  /** Most Patients this Clinician may have; null means no limit (the Admin). */
  patientLimit: number | null;
  /** The Admin, who may link an existing account from "+ New patient"; null for a Clinician. */
  adminId: string | null;
}) {
  const { loaded, failed, refresh } = useReloadingLoad(loadPatients);
  const error = failed ? "Could not load your patients — try again later." : null;
  const [creating, setCreating] = useState(false);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: Dir }>({ key: "attention", dir: 1 });

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

  const nav = useRoster(sorted, (r) => r.patient.patientId);
  const openRow = nav.openId ? (rows.find((r) => r.patient.patientId === nav.openId) ?? null) : null;

  const onSort = (key: SortKey) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: SORT_DEFAULT_DIR[key] }));
    nav.setPage(0);
  };

  const clearFilters = () => {
    setQuery("");
    setStatusFilter("all");
    setAttentionOnly(false);
    nav.setPage(0);
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
      nav.setOpenId(null);
      await refresh();
      // Their row is gone: focus goes back to the search.
      nav.searchRef.current?.focus();
      flash("Patient disconnected");
    } catch {
      flash("Could not disconnect the patient");
    }
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
          <NewPatientForm adminId={adminId} onCreated={() => void refresh()} onClose={() => setCreating(false)} />
        </div>
      )}

      {error && <p className="library-note">{error}</p>}
      {!error && !loaded && <p className="library-note">Loading your patients…</p>}
      {loaded && total === 0 && <p className="library-note">No patients yet — add one with + New patient.</p>}

      {loaded && total > 0 && (
        <>
          <div className="roster-toolbar">
            <RosterSearch
              nav={nav}
              value={query}
              onChange={setQuery}
              placeholder="Search name, @username or email"
              label="Search patients"
            />
            <StatusSelect
              value={statusFilter}
              onChange={(s) => {
                setStatusFilter(s);
                nav.setPage(0);
              }}
              total={searched.length}
              counts={statusCounts}
            />
            <AttentionToggle
              on={attentionOnly}
              count={attentionCount}
              onToggle={() => {
                setAttentionOnly(!attentionOnly);
                nav.setPage(0);
              }}
            />
          </div>

          <RosterMeta
            nav={nav}
            shown={sorted.length}
            total={total}
            sortKey={sort.key}
            sortKeys={SORT_KEYS}
            sortLabel={SORT_LABEL}
            onSortKey={(key) => setSort({ key, dir: SORT_DEFAULT_DIR[key] })}
          />

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
            <tbody onKeyDown={nav.onRowKey}>
              {nav.paged.map((r, i) => (
                <PatientRow
                  key={r.patient.patientId}
                  row={r}
                  now={now}
                  open={r.patient.patientId === nav.openId}
                  onOpen={() => nav.openAt(nav.start + i)}
                  buttonRef={nav.rowButtonRef(r.patient.patientId)}
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

          <RosterFoot nav={nav} />
        </>
      )}

      {openRow && (
        <Drawer
          itemId={openRow.patient.patientId}
          label={`${openRow.name} — details`}
          index={nav.openIndex}
          total={sorted.length}
          onStep={(delta) => nav.openAt(nav.openIndex + delta)}
          onClose={nav.closeDrawer}
        >
          <PatientDetail
            key={openRow.patient.patientId}
            patient={openRow.patient}
            roles={rolesOf({ role: openRow.patient.role, clinicianId: openRow.patient.clinicianId, patientCount: 0 })}
            statusReading={openRow.statusReading}
            zoneLabel={timeZoneLabel(openRow.timeZone, now)}
            viewer="clinician"
            viewerRole={adminId !== null ? "admin" : "clinician"}
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
        <button className="roster-open" data-row-id={r.patient.patientId} aria-haspopup="dialog" ref={buttonRef}>
          <span className="roster-name">{r.name}</span>
          {sub && <span className="roster-sub">{sub}</span>}
        </button>
      </td>
      <td className="roster-c-status">
        {r.statusReading ? <StatusPill reading={r.statusReading} short /> : faint}
      </td>
      <td className="roster-c-last">
        {a ? (
          <span className={a.lastPlayAt ? "" : "roster-faint"}>
            {lastListened(a.lastPlayAt, r.quietDays, r.timeZone, now)}
          </span>
        ) : (
          faint
        )}
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
