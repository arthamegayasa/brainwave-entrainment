import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { disconnectPatient } from "../lib/accounts";
import type { PatientLink } from "../lib/clinician";
import { loadUserOverview } from "../lib/userOverview";
import type { UserOverview } from "../lib/userOverview";
import { daysAgo, isKnownTimeZone, timeZoneLabel } from "../state/listeningReport";
import { needsAttention } from "../state/patientStatus";
import type { PatientStatus } from "../state/patientStatus";
import {
  accountLabel,
  firstName,
  isInactiveClinician,
  patientLimitOf,
  rolesOf,
} from "../../supabase/functions/_shared/accountRules.ts";
import type { ShownRole } from "../../supabase/functions/_shared/accountRules.ts";
import { ClinicianRole, ORIGIN_NAMES } from "./ClinicianRole";
import type { ClinicianRoleAccount } from "./ClinicianRole";
import { ListeningReport } from "./ListeningReport";
import { formatMinutes } from "./listeningFormat";
import { NewClinicianForm } from "./NewClinicianForm";
import { PasswordViews } from "./PasswordViews";
import { PatientDetail } from "./PatientDetail";
import { STATUS_NAMES, StatusPill, readStatus } from "./PatientStatusPill";
import type { StatusReading } from "./PatientStatusPill";
import {
  AttentionToggle,
  Drawer,
  InactivePill,
  RoleBadges,
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
 * The Admin's Clinicians & Patients tab (#13; prototype Variant 2 for the
 * Admin): everyone on Serenade in the same table + drawer as the Patients tab,
 * with role tabs and counts, Role and Clinician columns, a Clinician filter
 * and removable filter chips. A Clinician row shows their caseload and whether
 * they are an Inactive Clinician; their drawer drills into their Patients and
 * back. Any Patient's drawer lets the Admin act exactly as that Patient's
 * Clinician would. The Admin creates Clinicians here, and in the drawer
 * promotes Users, raises Patient limits and handles the passwords of
 * Clinicians they created (#14). Everything comes from one aggregate read
 * (user_overview, 0013); roles follow from it through the Account rules.
 */

type RoleTab = "all" | "clinicians" | "patients" | "regulars";
type SortKey = "attention" | "name" | "role" | "clinician" | "last" | "minutes" | "plays" | "stopped" | "premium" | "assigned";

/** A Clinician's Patients, summed up for their row, their drawer and the scope banner. */
interface Caseload {
  patients: number;
  /** Null for the Admin, who has no limit. */
  limit: number | null;
  needAttention: number;
  /** Patients with a Play in the last 7 days. */
  listenedThisWeek: number;
  listenedSec7: number;
  dailySec7: number[];
  /** An Inactive Clinician: Patients, but no Clinician role. */
  inactive: boolean;
}

/** One User, with everything the table derives about them. */
interface Person {
  user: UserOverview;
  name: string;
  roles: ShownRole[];
  /** Their zone, else this device's: every day and time of the row is on that clock. */
  timeZone: string;
  /** Calendar days since their last Play (0 = today); null when they never had one. */
  quietDays: number | null;
  /** Their Patient Status; null unless they are a Patient. */
  statusReading: StatusReading | null;
  /** Their Clinician; null unless they are a Patient. */
  clinician: Person | null;
  /** Their own Patients; null unless they are a Clinician, the Admin or an Inactive Clinician. */
  caseload: Caseload | null;
}

/** A Person as one row of the current role tab shows them. */
interface Row {
  person: Person;
  /** A Clinician who is also a Patient reads as a Patient on the Patients tab, as a Clinician elsewhere. */
  kind: "clinician" | "patient" | "regular";
}

const ROLE_TABS: ReadonlyArray<{ key: RoleTab; label: string }> = [
  { key: "all", label: "All" },
  { key: "clinicians", label: "Clinicians" },
  { key: "patients", label: "Patients" },
  { key: "regulars", label: "Regulars" },
];

const SORT_DEFAULT_DIR: Record<SortKey, Dir> = {
  attention: 1,
  name: 1,
  role: 1,
  clinician: 1,
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
  role: "Role",
  clinician: "Clinician",
  minutes: "Most minutes this week",
  plays: "Most Plays this week",
  stopped: "Most stopped this week",
  premium: "Premium first",
  assigned: "Most assigned audio",
};

const SORT_KEYS: readonly SortKey[] = [
  "attention",
  "last",
  "name",
  "role",
  "clinician",
  "minutes",
  "plays",
  "stopped",
  "premium",
  "assigned",
];

/** Everyone, with roles, Patient Status, Clinicians and caseloads derived from the aggregate read. */
function toPeople(users: UserOverview[], now: number): Person[] {
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const patientsOf = new Map<string, UserOverview[]>();
  for (const u of users) {
    if (u.link) patientsOf.set(u.link.clinicianId, [...(patientsOf.get(u.link.clinicianId) ?? []), u]);
  }

  const people = users.map((user): Person => {
    const patientCount = patientsOf.get(user.userId)?.length ?? 0;
    // The server keeps only zones the database knows; this browser may still not.
    const zone = user.activity.timeZone;
    const timeZone = zone && isKnownTimeZone(zone) ? zone : deviceZone;
    return {
      user,
      name: accountLabel(user) ?? "Unnamed user",
      roles: rolesOf({ role: user.role, clinicianId: user.link?.clinicianId ?? null, patientCount }),
      timeZone,
      quietDays: user.activity.lastPlayAt ? daysAgo(user.activity.lastPlayAt, now, timeZone) : null,
      statusReading: user.link ? readStatus(user.activity, now, timeZone) : null,
      clinician: null,
      caseload: null,
    };
  });

  const byId = new Map(people.map((p) => [p.user.userId, p]));
  for (const p of people) {
    if (p.user.link) p.clinician = byId.get(p.user.link.clinicianId) ?? null;
    if (!p.roles.includes("clinician") && !p.roles.includes("admin")) continue;
    const patients = (patientsOf.get(p.user.userId) ?? []).flatMap((u) => byId.get(u.userId) ?? []);
    p.caseload = {
      patients: patients.length,
      limit: patientLimitOf(p.user),
      needAttention: patients.filter((pt) => pt.statusReading && needsAttention(pt.statusReading.status)).length,
      listenedThisWeek: patients.filter((pt) => pt.user.activity.plays7 > 0).length,
      listenedSec7: patients.reduce((sum, pt) => sum + pt.user.activity.listenedSec7, 0),
      // Day by day back from each Patient's today, whatever their zone.
      dailySec7: Array.from({ length: 7 }, (_, i) =>
        patients.reduce((sum, pt) => sum + (pt.user.activity.dailySec7[i] ?? 0), 0),
      ),
      inactive: isInactiveClinician({ role: p.user.role, patientCount: patients.length }),
    };
  }
  return people;
}

/** Everyone as the tab shows them, read at one moment. */
async function loadPeople() {
  const users = await loadUserOverview();
  const now = Date.now();
  return { people: toPeople(users, now), now };
}

function toRow(person: Person, tab: RoleTab): Row {
  const isPatient = person.user.link !== null;
  const kind =
    tab === "patients" && isPatient ? "patient" : person.caseload ? "clinician" : isPatient ? "patient" : "regular";
  return { person, kind };
}

function isAttention(r: Row): boolean {
  if (r.kind === "patient") return r.person.statusReading !== null && needsAttention(r.person.statusReading.status);
  if (r.kind === "clinician" && r.person.caseload) return r.person.caseload.needAttention > 0 || r.person.caseload.inactive;
  return false;
}

function sortValue(r: Row, key: SortKey): number | string | null {
  const { person: p } = r;
  const a = p.user.activity;
  switch (key) {
    case "attention":
      // Lower = more urgent. Inactive Clinicians first: their Patients are
      // unmonitored. Then whoever needs attention (a Patient the longest
      // without a Play, a Clinician with the most Patients who need it), then
      // the rest in the same way, Regulars last.
      if (r.kind === "clinician" && p.caseload) {
        return (p.caseload.inactive ? -300_000 : isAttention(r) ? 0 : 200_000) - p.caseload.needAttention;
      }
      if (r.kind === "patient") return (isAttention(r) ? 0 : 200_000) - (p.quietDays ?? 100_000);
      return 400_000;
    case "name":
      return p.name.toLowerCase();
    case "role":
      return p.roles.join(" ");
    case "clinician":
      return r.kind === "patient" && p.clinician ? p.clinician.name.toLowerCase() : null;
    case "last":
      return r.kind === "clinician" || !a.lastPlayAt ? null : Date.parse(a.lastPlayAt);
    case "minutes":
      return r.kind === "clinician" ? (p.caseload?.listenedSec7 ?? null) : a.listenedSec7;
    case "plays":
      return r.kind === "clinician" ? null : a.plays7;
    case "stopped":
      return r.kind === "clinician" ? null : a.stopped7;
    case "premium":
      return r.kind === "patient" && p.user.link ? (p.user.link.premiumGrant ? 1 : 0) : null;
    case "assigned":
      return r.kind === "patient" ? p.user.assigned : null;
  }
}

/** By `key` in `dir`, empty values last, ties by name. */
function compareRows(a: Row, b: Row, key: SortKey, dir: Dir): number {
  return compareSortValues(sortValue(a, key), sortValue(b, key), dir) || a.person.name.localeCompare(b.person.name);
}

/** "28 / 30" for a Clinician, "4" for the Admin, who has no limit. */
function caseloadText(c: Caseload): string {
  return c.limit === null ? `${c.patients}` : `${c.patients} / ${c.limit}`;
}

/** The Patient as PatientDetail and the Account server functions know them. */
function patientLinkOf(user: UserOverview, link: NonNullable<UserOverview["link"]>): PatientLink {
  return {
    patientId: user.userId,
    clinicianId: link.clinicianId,
    name: user.name,
    role: user.role,
    username: user.username,
    email: user.email,
    linkedAt: link.linkedAt,
    premiumGrant: link.premiumGrant,
  };
}

/** Someone's Clinician role as the drawer's ClinicianRole block reads it. */
function clinicianRoleAccountOf(person: Person): ClinicianRoleAccount {
  const { user } = person;
  return {
    userId: user.userId,
    name: person.name,
    role: user.role,
    clinicianOrigin: user.clinicianOrigin,
    patientLimit: user.patientLimit,
    patientCount: person.caseload?.patients ?? 0,
  };
}

export function PeopleTab({ flash }: { flash: (msg: string) => void }) {
  const { loaded, failed, refresh } = useReloadingLoad(loadPeople);
  const error = failed ? "Could not load everyone — try again later." : null;

  const [query, setQuery] = useState("");
  const [roleTab, setRoleTab] = useState<RoleTab>("all");
  const [clinicianId, setClinicianId] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: Dir }>({ key: "attention", dir: 1 });
  /** A Clinician to turn to and focus once the list shows them again ("‹ All clinicians"). */
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const scopeRef = useRef<HTMLHeadingElement>(null);

  const now = loaded?.now ?? 0;
  const people = useMemo(() => loaded?.people ?? [], [loaded]);
  const byId = useMemo(() => new Map(people.map((p) => [p.user.userId, p])), [people]);
  const clinicians = useMemo(
    () => people.filter((p) => p.caseload !== null).sort((a, b) => a.name.localeCompare(b.name)),
    [people],
  );

  const q = query.trim().toLowerCase().replace(/^@/, "");
  const searched = useMemo(
    () =>
      people.filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          (p.user.username?.includes(q) ?? false) ||
          (p.user.email?.toLowerCase().includes(q) ?? false),
      ),
    [people, q],
  );

  const roleCounts = useMemo<Record<RoleTab, number>>(
    () => ({
      all: searched.length,
      clinicians: searched.filter((p) => p.caseload !== null).length,
      patients: searched.filter((p) => p.user.link !== null).length,
      regulars: searched.filter((p) => p.roles.includes("regular")).length,
    }),
    [searched],
  );

  const scoped = useMemo(
    () =>
      searched
        .filter((p) => {
          if (roleTab === "clinicians" && p.caseload === null) return false;
          if (roleTab === "patients" && p.user.link === null) return false;
          if (roleTab === "regulars" && !p.roles.includes("regular")) return false;
          if (clinicianId && p.user.link?.clinicianId !== clinicianId) return false;
          return true;
        })
        .map((p) => toRow(p, roleTab)),
    [searched, roleTab, clinicianId],
  );

  const { statusCounts, patientCount, attentionCount } = useMemo(() => {
    const counts: Record<PatientStatus, number> = { new: 0, "not-started": 0, quiet: 0, "stops-early": 0, "on-track": 0 };
    let patients = 0;
    for (const r of scoped) {
      if (r.kind !== "patient" || !r.person.statusReading) continue;
      counts[r.person.statusReading.status]++;
      patients++;
    }
    return { statusCounts: counts, patientCount: patients, attentionCount: scoped.filter(isAttention).length };
  }, [scoped]);

  const sorted = useMemo(
    () =>
      scoped
        .filter(
          (r) =>
            (statusFilter === "all" || (r.kind === "patient" && r.person.statusReading?.status === statusFilter)) &&
            (!attentionOnly || isAttention(r)),
        )
        .sort((a, b) => compareRows(a, b, sort.key, sort.dir)),
    [scoped, statusFilter, attentionOnly, sort],
  );

  const nav = useRoster(sorted, (r) => r.person.user.userId, scopeRef);
  const { setPage, pageSize, focusRow } = nav;

  // Back from a Clinician's Patients: turn to the page that lists the Clinician and focus their row.
  useEffect(() => {
    if (returnTo === null) return;
    const i = sorted.findIndex((r) => r.person.user.userId === returnTo);
    if (i >= 0 && pageSize) setPage(Math.floor(i / pageSize));
    focusRow(returnTo);
    setReturnTo(null);
  }, [returnTo, sorted, pageSize, setPage, focusRow]);

  const openRow = useMemo(() => {
    if (!nav.openId) return null;
    const inList = sorted.find((r) => r.person.user.userId === nav.openId);
    if (inList) return inList;
    const person = byId.get(nav.openId);
    return person ? toRow(person, "all") : null;
  }, [nav.openId, sorted, byId]);

  const scopeClinician = clinicianId ? (byId.get(clinicianId) ?? null) : null;

  const onSort = (key: SortKey) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: SORT_DEFAULT_DIR[key] }));
    nav.setPage(0);
  };

  const changeTab = (tab: RoleTab) => {
    setRoleTab(tab);
    if (tab !== "patients") setClinicianId("");
    if (tab === "clinicians" || tab === "regulars") setStatusFilter("all");
    if (tab === "regulars") setAttentionOnly(false);
    nav.setPage(0);
  };

  const filterByClinician = (id: string) => {
    setClinicianId(id);
    if (id) setRoleTab("patients");
    nav.setPage(0);
  };

  /** From a Clinician to their Patients, the Patients who need attention first. */
  const viewPatientsOf = (id: string) => {
    nav.setOpenId(null);
    setQuery("");
    setStatusFilter("all");
    setAttentionOnly(false);
    setRoleTab("patients");
    setClinicianId(id);
    setSort({ key: "attention", dir: 1 });
    nav.setPage(0);
    requestAnimationFrame(() => scopeRef.current?.focus());
  };

  const backToClinicians = () => {
    setReturnTo(clinicianId);
    setClinicianId("");
    setStatusFilter("all");
    setRoleTab("clinicians");
  };

  const clearAll = () => {
    setQuery("");
    setStatusFilter("all");
    setAttentionOnly(false);
    setClinicianId("");
    nav.setPage(0);
  };

  const disconnect = async (person: Person) => {
    const from = person.clinician ? ` from ${person.clinician.name}` : "";
    if (
      !window.confirm(
        `Disconnect ${person.name}${from}? They keep their account and sign-in, but lose their clinician's assigned audio, curation and Premium grant.`,
      )
    ) {
      return;
    }
    try {
      await disconnectPatient(person.user.userId);
      await refresh();
      flash("Patient disconnected");
    } catch {
      flash("Could not disconnect the patient");
    }
  };

  const chips: Array<{ label: string; clear: () => void }> = [];
  if (q) chips.push({ label: `Search: “${query.trim()}”`, clear: () => setQuery("") });
  if (scopeClinician) chips.push({ label: `Clinician: ${scopeClinician.name}`, clear: () => filterByClinician("") });
  if (statusFilter !== "all") {
    chips.push({ label: `Status: ${STATUS_NAMES[statusFilter].label}`, clear: () => setStatusFilter("all") });
  }
  if (attentionOnly) chips.push({ label: "Needs attention", clear: () => setAttentionOnly(false) });

  const showStatus = roleTab === "all" || roleTab === "patients";
  const showAttention = roleTab !== "regulars";
  const regulars = people.filter((p) => p.roles.includes("regular")).length;
  const patientsTotal = people.filter((p) => p.user.link !== null).length;

  return (
    <div className="roster roster--admin">
      <div className="roster-head">
        <div>
          <h2 className="roster-title">Clinicians &amp; Patients</h2>
          {loaded && (
            <p className="roster-head-sub">
              {people.length} people · {clinicians.length} clinicians · {patientsTotal} patients · {regulars} regulars
            </p>
          )}
        </div>
        {!creating && (
          <div className="roster-head-side">
            <button className="chip small roster-primary" onClick={() => setCreating(true)}>
              + Create clinician
            </button>
          </div>
        )}
      </div>

      {creating && (
        <div className="library-section roster-create">
          <NewClinicianForm onCreated={() => void refresh()} onClose={() => setCreating(false)} />
        </div>
      )}

      {error && <p className="library-note">{error}</p>}
      {!error && !loaded && <p className="library-note">Loading everyone…</p>}

      {loaded && (
        <>
          <div className="roster-tabs" role="tablist" aria-label="Filter by role">
            {ROLE_TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={roleTab === t.key}
                aria-controls="people-table"
                className="roster-tab"
                onClick={() => changeTab(t.key)}
              >
                {t.label}
                <span className="roster-tab-count">{roleCounts[t.key]}</span>
              </button>
            ))}
          </div>

          {scopeClinician?.caseload && (
            <div className="roster-scope">
              <button className="roster-scope-back" onClick={backToClinicians}>
                ‹ All clinicians
              </button>
              <div className="roster-scope-text">
                <h3 ref={scopeRef} tabIndex={-1}>
                  Patients of {scopeClinician.name}
                </h3>
                <CaseloadLine caseload={scopeClinician.caseload} />
              </div>
              <button className="chip small" onClick={() => nav.setOpenId(scopeClinician.user.userId)}>
                Clinician profile
              </button>
            </div>
          )}

          <div className="roster-toolbar">
            <RosterSearch
              nav={nav}
              value={query}
              onChange={setQuery}
              placeholder="Search everyone — name, @username or email"
              label="Search everyone"
            />
            {showStatus && (
              <StatusSelect
                value={statusFilter}
                onChange={(s) => {
                  setStatusFilter(s);
                  nav.setPage(0);
                }}
                total={patientCount}
                counts={statusCounts}
              />
            )}
            <select
              className="select"
              aria-label="Filter by clinician"
              value={clinicianId}
              onChange={(e) => filterByClinician(e.target.value)}
            >
              <option value="">All clinicians</option>
              {clinicians.map((c) => (
                <option key={c.user.userId} value={c.user.userId}>
                  {c.name} · {c.caseload?.patients ?? 0} patients{c.caseload?.inactive ? " · inactive" : ""}
                </option>
              ))}
            </select>
            {showAttention && (
              <AttentionToggle
                on={attentionOnly}
                count={attentionCount}
                onToggle={() => {
                  setAttentionOnly(!attentionOnly);
                  nav.setPage(0);
                }}
              />
            )}
          </div>

          {chips.length > 0 && (
            <div className="roster-chipbar" role="group" aria-label="Active filters">
              <span className="roster-chipbar-label">Filtered by</span>
              {chips.map((c) => (
                <button
                  key={c.label}
                  className="roster-fchip"
                  onClick={() => {
                    c.clear();
                    nav.setPage(0);
                  }}
                  aria-label={`Remove filter ${c.label}`}
                >
                  {c.label}
                  <span aria-hidden="true">✕</span>
                </button>
              ))}
              {chips.length > 1 && (
                <button className="roster-clear-all" onClick={clearAll}>
                  Clear all
                </button>
              )}
            </div>
          )}

          <RosterMeta
            nav={nav}
            shown={sorted.length}
            total={people.length}
            sortKey={sort.key}
            sortKeys={SORT_KEYS}
            sortLabel={SORT_LABEL}
            onSortKey={(key) => setSort({ key, dir: SORT_DEFAULT_DIR[key] })}
          />

          <table className="roster-table" id="people-table">
            <caption className="roster-sr">
              Everyone on Serenade. Column headers sort; select a name to open the details.
            </caption>
            <thead>
              <tr>
                <SortTh k="name" label="Name" sort={sort} onSort={onSort} className="roster-c-name" />
                <SortTh k="role" label="Role" sort={sort} onSort={onSort} className="roster-c-role" />
                <SortTh k="clinician" label="Clinician" sort={sort} onSort={onSort} className="roster-c-clin" />
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
                <PersonRow
                  key={r.person.user.userId}
                  row={r}
                  now={now}
                  open={r.person.user.userId === nav.openId}
                  onOpen={() => nav.openAt(nav.start + i)}
                  onClinician={filterByClinician}
                  buttonRef={nav.rowButtonRef(r.person.user.userId)}
                />
              ))}
              {sorted.length === 0 && (
                <tr className="roster-empty-row">
                  <td colSpan={10}>
                    <p>{q ? `No one matches “${query.trim()}”.` : "No one matches these filters."}</p>
                    <button className="chip small" onClick={clearAll}>
                      Clear filters
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <RosterFoot nav={nav} />

          <PasswordViews />
        </>
      )}

      {openRow && (
        <Drawer
          itemId={openRow.person.user.userId}
          label={`${openRow.person.name} — details`}
          index={nav.openIndex}
          total={sorted.length}
          onStep={(delta) => nav.openAt(nav.openIndex + delta)}
          onClose={nav.closeDrawer}
        >
          <PersonCallouts
            person={openRow.person}
            clinician={openRow.person.clinician}
            scopeClinicianId={clinicianId}
            onViewPatients={viewPatientsOf}
          />
          {openRow.person.user.link ? (
            <PatientDetail
              key={openRow.person.user.userId}
              patient={patientLinkOf(openRow.person.user, openRow.person.user.link)}
              roles={openRow.person.roles}
              statusReading={openRow.person.statusReading}
              zoneLabel={timeZoneLabel(openRow.person.timeZone, now)}
              viewer="admin"
              flash={flash}
              onChange={refresh}
              onDisconnect={() => {
                void disconnect(openRow.person);
              }}
              clinicianRole={
                <ClinicianRole
                  account={clinicianRoleAccountOf(openRow.person)}
                  passwordShownAsPatient={openRow.person.user.username !== null}
                  flash={flash}
                  onChange={refresh}
                />
              }
            />
          ) : (
            <PersonDetail
              key={openRow.person.user.userId}
              person={openRow.person}
              now={now}
              clinicianRole={
                <ClinicianRole
                  account={clinicianRoleAccountOf(openRow.person)}
                  passwordShownAsPatient={false}
                  flash={flash}
                  onChange={refresh}
                />
              }
            />
          )}
        </Drawer>
      )}
    </div>
  );
}

/** "28 / 30 patients · 5 need attention · 20 listened this week", and the Inactive flag. */
function CaseloadLine({ caseload: c }: { caseload: Caseload }) {
  return (
    <span className="roster-caseload">
      <span>
        <strong>{caseloadText(c)}</strong> {c.patients === 1 && c.limit === null ? "patient" : "patients"} ·{" "}
        {c.needAttention} need attention · {c.listenedThisWeek} listened this week
      </span>
      {c.inactive && <InactivePill label="Clinician inactive" />}
    </span>
  );
}

/**
 * The drawer's way through the Clinician relation: a Clinician's caseload with
 * "View their N patients", and a Patient's Clinician with "See all of their
 * patients" (unless the list already shows only them).
 */
function PersonCallouts({
  person,
  clinician,
  scopeClinicianId,
  onViewPatients,
}: {
  person: Person;
  clinician: Person | null;
  scopeClinicianId: string;
  onViewPatients: (clinicianId: string) => void;
}) {
  const callouts: ReactNode[] = [];
  if (person.caseload) {
    const c = person.caseload;
    callouts.push(
      <div className="roster-callout" key="caseload">
        <CaseloadLine caseload={c} />
        {c.patients > 0 ? (
          <button className="chip small selected" onClick={() => onViewPatients(person.user.userId)}>
            View their {c.patients} patients ›
          </button>
        ) : (
          <span className="roster-faint">No patients yet</span>
        )}
      </div>,
    );
  }
  if (clinician && clinician.user.userId !== scopeClinicianId) {
    callouts.push(
      <div className="roster-callout" key="clinician">
        <span className="roster-caseload">
          <span>
            Patient of <strong>{clinician.name}</strong>
          </span>
          {clinician.caseload?.inactive && <InactivePill label="Clinician inactive" />}
        </span>
        <button className="chip small" onClick={() => onViewPatients(clinician.user.userId)}>
          See all {clinician.caseload?.patients ?? 0} of their patients ›
        </button>
      </div>,
    );
  }
  return <>{callouts}</>;
}

/** Someone who is not a Patient: who they are, their Clinician role, and their Listening History. */
function PersonDetail({ person, now, clinicianRole }: { person: Person; now: number; clinicianRole: ReactNode }) {
  const { user } = person;
  return (
    <div className="patient-detail">
      <header className="patient-detail-head">
        <div className="patient-detail-title">
          <h3>{person.name}</h3>
          <RoleBadges roles={person.roles} />
        </div>
        <p className="patient-detail-meta">
          {[user.username && `@${user.username}`, user.email, `times in ${timeZoneLabel(person.timeZone, now)}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>
      {clinicianRole}
      <div className="detail-block">
        <h4>Listening history</h4>
        <ListeningReport
          userId={user.userId}
          firstName={firstName(user.name) ?? person.name}
          headingLevel={5}
        />
      </div>
    </div>
  );
}

function PersonRow({
  row: r,
  now,
  open,
  onOpen,
  onClinician,
  buttonRef,
}: {
  row: Row;
  now: number;
  open: boolean;
  onOpen: () => void;
  /** Filters the list to a Clinician's Patients. */
  onClinician: (clinicianId: string) => void;
  buttonRef: (el: HTMLButtonElement | null) => void;
}) {
  const p = r.person;
  const a = p.user.activity;
  const c = r.kind === "clinician" ? p.caseload : null;
  const sub = r.kind === "clinician" ? p.user.email : p.user.username ? `@${p.user.username}` : p.user.email;
  const faint = <span className="roster-faint">—</span>;

  let status: ReactNode = faint;
  if (r.kind === "patient" && p.statusReading) status = <StatusPill reading={p.statusReading} short />;
  else if (c) {
    status = (
      <span className="roster-load">
        <span className="roster-load-main">
          <strong>{caseloadText(c)}</strong>
          {c.needAttention > 0 && <span className="roster-load-warn"> · {c.needAttention} need attention</span>}
        </span>
        {c.inactive && <InactivePill />}
      </span>
    );
  }

  let clinicianCell: ReactNode = faint;
  const clin = r.kind === "patient" ? p.clinician : null;
  if (clin) {
    clinicianCell = (
      <span className="roster-clin">
        <button
          className="roster-clin-link"
          title={`Show only ${clin.name}'s patients`}
          aria-label={`Show only ${clin.name}'s patients`}
          onClick={(e) => {
            e.stopPropagation();
            onClinician(clin.user.userId);
          }}
        >
          {clin.name}
        </button>
        {clin.caseload?.inactive && <InactivePill label="Clinician inactive" />}
      </span>
    );
  } else if (c) {
    const origin = p.user.role === "admin" ? "Admin" : p.user.clinicianOrigin && ORIGIN_NAMES[p.user.clinicianOrigin];
    clinicianCell = origin ? <span className="roster-faint">{origin}</span> : faint;
  }

  const week = c ? { dailySec: c.dailySec7, sec: c.listenedSec7, label: "Patients' minutes per day, last 7 days" } : null;

  return (
    <tr
      className={`roster-row roster-kind-${r.kind}${open ? " is-open" : ""}${isAttention(r) ? " is-attn" : ""}`}
      aria-current={open ? "true" : undefined}
      onClick={onOpen}
    >
      <td className="roster-c-name">
        <button className="roster-open" data-row-id={p.user.userId} aria-haspopup="dialog" ref={buttonRef}>
          <span className="roster-name">{p.name}</span>
          {sub && <span className="roster-sub">{sub}</span>}
        </button>
      </td>
      <td className="roster-c-role">
        <RoleBadges roles={p.roles} />
      </td>
      <td className="roster-c-clin">{clinicianCell}</td>
      <td className="roster-c-status">{status}</td>
      <td className="roster-c-last">
        {c ? (
          faint
        ) : (
          <span className={a.lastPlayAt ? "" : "roster-faint"}>{lastListened(a.lastPlayAt, p.quietDays, p.timeZone, now)}</span>
        )}
      </td>
      <td className="roster-c-week">
        <span className="roster-week">
          <WeekBars dailySec={week?.dailySec ?? a.dailySec7} label={week?.label} />
          <span className="roster-week-min">{formatMinutes(week?.sec ?? a.listenedSec7)}</span>
        </span>
      </td>
      <td className="roster-c-plays roster-num">{c ? faint : a.plays7}</td>
      <td className="roster-c-stopped roster-num">
        {c ? faint : <span className={p.statusReading?.status === "stops-early" ? "roster-warn" : ""}>{a.stopped7}</span>}
      </td>
      <td className="roster-c-premium">
        {r.kind !== "patient" || !p.user.link ? (
          faint
        ) : p.user.link.premiumGrant ? (
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
      <td className="roster-c-assigned roster-num">{r.kind === "patient" ? p.user.assigned : faint}</td>
    </tr>
  );
}
