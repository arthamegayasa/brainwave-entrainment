import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import type { Band } from "../audio/presets";
import { exportLabel, getExportJob, runMp3Export, subscribeExport } from "./mp3Export";
import { BAND_COLORS, BAND_LABELS } from "./bands";
import { useEntitlement } from "../lib/useEntitlement";
import {
  AUDIO_CATEGORIES,
  assignToAllPatients,
  assignToPatient,
  deleteAudio,
  listAudioUses,
  listBank,
  listMyPatients,
  patientName,
  updateAudioMeta,
} from "../lib/clinician";
import type { AudioCategory, BankAudio, PatientLink } from "../lib/clinician";
import { onPageRequest, openInStudio, takeAudioBankRequest } from "./studioRequest";
import { PatientsTab } from "./PatientsTab";
import { PeopleTab } from "./PeopleTab";
import { ScenePicker } from "./ScenePicker";

/**
 * Clinician Dashboard: Patients tab (the table of the Clinician's
 * Patients with their Patient Status, each opening in a drawer with their
 * detail) and Audio Bank tab (every Custom Audio the Clinician made, general
 * or made for one Patient, to find, open in the Studio, assign, and manage).
 * The Admin also gets the Clinicians & Patients tab: everyone on SwaraSanti in
 * the same table + drawer (#13). The App renders this only for
 * clinicians/admins; RLS enforces every rule server-side regardless.
 */

const BANDS: readonly Band[] = ["delta", "theta", "alpha", "beta", "gamma"];

type DashboardTab = "patients" | "bank" | "people";

export function Dashboard() {
  const ent = useEntitlement();
  const [tab, setTab] = useState<DashboardTab>("patients");
  const [notice, setNotice] = useState<string | null>(null);

  // Another page asked for the Audio Bank: before this mount, or while shown.
  // Taken in an effect, so StrictMode's second run finds nothing.
  useEffect(() => {
    if (takeAudioBankRequest()) setTab("bank");
    return onPageRequest((page) => {
      if (page === "dashboard" && takeAudioBankRequest()) setTab("bank");
    });
  }, []);

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 2600);
  };

  if (!ent.configured) {
    return (
      <section className="dashboard">
        <header className="library-head">
          <h1>Dashboard</h1>
          <p className="library-sub">
            The clinician dashboard needs the cloud backend, which isn't
            configured in this build.
          </p>
        </header>
      </section>
    );
  }

  return (
    <section className="dashboard">
      <header className="library-head">
        <h1>Dashboard</h1>
        <p className="library-sub">
          Your patients and your audio bank — all in one place.
        </p>
      </header>

      <div className="dash-tabs" role="tablist" aria-label="Dashboard sections">
        <button
          role="tab"
          aria-selected={tab === "patients"}
          className={tab === "patients" ? "selected" : ""}
          onClick={() => setTab("patients")}
        >
          Patients
        </button>
        <button
          role="tab"
          aria-selected={tab === "bank"}
          className={tab === "bank" ? "selected" : ""}
          onClick={() => setTab("bank")}
        >
          Audio Bank
        </button>
        {ent.role === "admin" && (
          <button
            role="tab"
            aria-selected={tab === "people"}
            className={tab === "people" ? "selected" : ""}
            onClick={() => setTab("people")}
          >
            Clinicians &amp; Patients
          </button>
        )}
      </div>

      {tab === "patients" && (
        <PatientsTab
          flash={flash}
          patientLimit={ent.patientLimit}
          adminId={ent.role === "admin" ? ent.userId : null}
        />
      )}
      {tab === "bank" && <BankTab flash={flash} />}
      {tab === "people" && ent.role === "admin" && <PeopleTab flash={flash} />}

      {notice && (
        <div className="notice dash-notice" role="status">
          {notice}
        </div>
      )}
    </section>
  );
}

/* ── Audio Bank tab ───────────────────────────────────────────────────── */

/** How many cards the Audio Bank shows at first, and adds per "Show more". */
const PAGE_SIZE = 24;

/** Whom the Audio Bank lists: everything, general audio, or audio made for Patients. */
type ForFilter = "all" | "general" | "made";

type BankSort = "saved" | "name";

/** The group of personal audio whose Patient is no longer linked to the Clinician. */
const FORMER_PATIENTS = "former";

interface BankSection {
  key: string;
  /** The Patient's name with their count; null outside the grouped view. */
  heading: string | null;
  audios: BankAudio[];
}

function BankTab({ flash }: { flash: (msg: string) => void }) {
  const [bank, setBank] = useState<BankAudio[] | null>(null);
  const [uses, setUses] = useState<Record<string, number>>({});
  const [patients, setPatients] = useState<PatientLink[]>([]);
  const [search, setSearch] = useState("");
  const [forFilter, setForFilter] = useState<ForFilter>("all");
  const [forPatient, setForPatient] = useState("all");
  const [category, setCategory] = useState<"all" | AudioCategory>("all");
  const [band, setBand] = useState<"all" | Band>("all");
  const [sort, setSort] = useState<BankSort>("saved");
  // How many matches show, under the filters they were counted for: other filters start over.
  const [limit, setLimit] = useState({ filters: "", count: PAGE_SIZE });
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const [bnk, use, pts] = await Promise.all([listBank(), listAudioUses(), listMyPatients()]);
      setBank(bnk);
      setUses(use);
      setPatients(pts);
      setError(null);
    } catch {
      setError("Could not load your audio bank — try again later.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const audios = bank ?? [];
  const names = new Map(patients.map((p) => [p.patientId, patientName(p)]));
  const groupOf = (madeFor: string) => (names.has(madeFor) ? madeFor : FORMER_PATIENTS);
  const groupName = (group: string) => names.get(group) ?? "Former patients";

  // The Patients who have personal audio, by name; former patients last.
  const groups = [...new Set(audios.flatMap((a) => (a.madeFor ? [groupOf(a.madeFor)] : [])))].sort(
    (a, b) =>
      Number(a === FORMER_PATIENTS) - Number(b === FORMER_PATIENTS) || groupName(a).localeCompare(groupName(b)),
  );
  const patientPick = groups.includes(forPatient) ? forPatient : "all";
  const grouped = forFilter === "made" && patientPick === "all";

  // Filters AND together: search (name/tagline/notes/based on) × For × category × band.
  const q = search.trim().toLowerCase();
  const matches = audios.filter((b) => {
    if (forFilter === "general" && b.madeFor !== null) return false;
    if (forFilter === "made") {
      if (b.madeFor === null) return false;
      if (patientPick !== "all" && groupOf(b.madeFor) !== patientPick) return false;
    }
    if (category !== "all" && b.category !== category) return false;
    if (band !== "all" && b.band !== band) return false;
    if (q) {
      const hay = `${b.name} ${b.goalTagline ?? ""} ${b.notes ?? ""} ${b.basedOn ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const bySort =
    sort === "name"
      ? (a: BankAudio, b: BankAudio) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      : (a: BankAudio, b: BankAudio) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  const rank = (a: BankAudio) => (grouped && a.madeFor ? groups.indexOf(groupOf(a.madeFor)) : 0);
  matches.sort((a, b) => rank(a) - rank(b) || bySort(a, b));

  const filters = JSON.stringify([q, forFilter, patientPick, category, band, sort]);
  const shown = limit.filters === filters ? limit.count : PAGE_SIZE;

  // In the grouped view the shown cards sit under each Patient's name.
  const sections: BankSection[] = [];
  for (const audio of matches.slice(0, shown)) {
    const key = grouped && audio.madeFor ? groupOf(audio.madeFor) : "all";
    const last = sections[sections.length - 1];
    if (last?.key === key) {
      last.audios.push(audio);
      continue;
    }
    const count = grouped ? matches.filter((a) => a.madeFor && groupOf(a.madeFor) === key).length : 0;
    sections.push({ key, heading: grouped ? `${groupName(key)} · ${count} audio` : null, audios: [audio] });
  }

  return (
    <div className="dash-bank">
      <div className="bank-filters">
        <div className="bank-toolbar">
          <button
            className="chip roster-primary"
            onClick={() => openInStudio({ kind: "new", madeFor: null })}
          >
            <span aria-hidden>+ </span>New audio
          </button>
          <input
            className="text-input"
            placeholder="Search your bank…"
            value={search}
            aria-label="Search audio bank"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="bank-selects">
          <label className="bank-select">
            <span>For</span>
            <select
              className="select"
              value={forFilter}
              onChange={(e) => setForFilter(e.target.value as ForFilter)}
            >
              <option value="all">All</option>
              <option value="general">General</option>
              <option value="made">Made for patients</option>
            </select>
          </label>
          {forFilter === "made" && (
            <label className="bank-select">
              <span>Patient</span>
              <select
                className="select"
                value={patientPick}
                onChange={(e) => setForPatient(e.target.value)}
              >
                <option value="all">All patients</option>
                {groups.map((g) => (
                  <option key={g} value={g}>
                    {groupName(g)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="bank-select">
            <span>Sort</span>
            <select className="select" value={sort} onChange={(e) => setSort(e.target.value as BankSort)}>
              <option value="saved">Recently saved</option>
              <option value="name">Name A–Z</option>
            </select>
          </label>
        </div>
        <div className="chips" role="group" aria-label="Category">
          <button
            className={`chip small ${category === "all" ? "selected" : ""}`}
            aria-pressed={category === "all"}
            onClick={() => setCategory("all")}
          >
            All
          </button>
          {AUDIO_CATEGORIES.map((c) => (
            <button
              key={c}
              className={`chip small ${category === c ? "selected" : ""}`}
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="chips" role="group" aria-label="Band">
          <button
            className={`chip small ${band === "all" ? "selected" : ""}`}
            aria-pressed={band === "all"}
            onClick={() => setBand("all")}
          >
            All bands
          </button>
          {BANDS.map((b) => (
            <button
              key={b}
              className={`chip small ${band === b ? "selected" : ""}`}
              aria-pressed={band === b}
              onClick={() => setBand(b)}
            >
              {BAND_LABELS[b]}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="library-note">{error}</p>}
      {!error && bank === null && <p className="library-note">Loading your audio bank…</p>}
      {!error && bank?.length === 0 && (
        <p className="library-note">
          Your bank is empty — design a session in the Studio and save it here.
        </p>
      )}
      {!error && audios.length > 0 && matches.length === 0 && (
        <p className="library-note">No audio matches these filters.</p>
      )}

      {!error && matches.length > 0 && (
        <>
          <p className="bank-count">
            {shown < matches.length ? `Showing ${shown} of ${matches.length} audio` : `${matches.length} audio`}
          </p>
          {sections.map((section) => (
            <section className="bank-section" key={section.key}>
              {section.heading && <h2 className="bank-group-head">{section.heading}</h2>}
              <div className="bank-grid">
                {section.audios.map((audio) => (
                  <BankCard
                    key={audio.id}
                    audio={audio}
                    madeForName={audio.madeFor ? (names.get(audio.madeFor) ?? null) : null}
                    uses={uses[audio.id] ?? 0}
                    patients={patients}
                    flash={flash}
                    onChange={() => void refresh()}
                  />
                ))}
              </div>
            </section>
          ))}
          {shown < matches.length && (
            <button
              className="chip bank-more"
              onClick={() => setLimit({ filters, count: shown + PAGE_SIZE })}
            >
              Show more
            </button>
          )}
        </>
      )}
    </div>
  );
}

const EXPORT_LENGTHS_MIN = [5, 10, 15, 30, 45, 60] as const;

function BankCard({
  audio,
  madeForName,
  uses,
  patients,
  flash,
  onChange,
}: {
  audio: BankAudio;
  /** The name of the Patient it is made for; null when general or when that Patient left. */
  madeForName: string | null;
  /** How many Users it is assigned to. */
  uses: number;
  patients: PatientLink[];
  flash: (msg: string) => void;
  onChange: () => void;
}) {
  const [assignOpen, setAssignOpen] = useState(false);
  const [target, setTarget] = useState<string>("all");
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState(audio.name);
  const [tagline, setTagline] = useState(audio.goalTagline ?? "");
  const [category, setCategory] = useState<AudioCategory>(audio.category);
  const [notes, setNotes] = useState(audio.notes ?? "");
  const [sceneId, setSceneId] = useState(audio.spec.sceneId);
  const [busy, setBusy] = useState(false);
  const [dlOpen, setDlOpen] = useState(false);
  const [dlMin, setDlMin] = useState(15);
  // App-wide single-flight export (mp3Export.ts): every card disables while
  // any export runs; only the owning card shows progress.
  const exportJob = useSyncExternalStore(subscribeExport, getExportJob);
  const exportBusy = exportJob !== null;

  const notesPreview =
    audio.notes && audio.notes.length > 80
      ? `${audio.notes.slice(0, 80)}…`
      : audio.notes;
  // Only general audio goes to other Patients: personal audio is its Patient's, a Template everyone's.
  const assignable = audio.madeFor === null && !audio.isTemplate;
  const kind = audio.isTemplate
    ? "Template"
    : audio.madeFor !== null
      ? `Made for ${madeForName ?? "a former patient"}`
      : `General · ${uses === 0 ? "not assigned yet" : `used by ${uses}`}`;

  const doAssign = async () => {
    setBusy(true);
    try {
      if (target === "all") {
        await assignToAllPatients(audio.id);
        flash("Assigned to all patients ✓");
      } else {
        await assignToPatient(audio.id, target);
        flash("Assigned ✓");
      }
      setAssignOpen(false);
      onChange();
    } catch {
      flash("Could not assign the audio");
    } finally {
      setBusy(false);
    }
  };

  const doSave = async () => {
    setBusy(true);
    try {
      await updateAudioMeta(audio.id, {
        name: name.trim() || audio.name,
        goalTagline: tagline.trim() || null,
        category,
        notes: notes.trim() || null,
        // Change Scene: only a new pick rewrites the stored spec.
        spec: sceneId === audio.spec.sceneId ? undefined : { ...audio.spec, sceneId },
      });
      setEditOpen(false);
      onChange();
      flash("Saved ✓");
    } catch {
      flash("Could not save the changes");
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    const losing =
      audio.madeFor === null ? "Patients lose" : `${madeForName ?? "The patient it was made for"} loses`;
    if (!window.confirm(`Delete "${audio.name}" from your bank? ${losing} access to it.`)) {
      return;
    }
    try {
      await deleteAudio(audio.id);
      onChange();
      flash("Deleted ✓");
    } catch {
      flash("Could not delete the audio");
    }
  };

  const doDownload = async () => {
    try {
      const saved = await runMp3Export(
        audio.id,
        audio.name,
        {
          audio: { kind: "custom", id: audio.id, name: audio.name, emoji: null, band: audio.band },
          lengthMin: dlMin,
        },
        async (onPhase) => {
          // Dynamic on purpose: code-splits the MP3 encoder out of startup.
          const { exportSessionMp3 } = await import("../audio/export");
          return exportSessionMp3(audio.spec, dlMin, onPhase);
        },
      );
      if (saved) flash("MP3 saved ✓");
    } catch {
      flash("Export failed — try a shorter length.");
    }
  };

  const dlLabel =
    exportJob?.id === audio.id ? exportLabel(exportJob) : "Download MP3";

  return (
    <div
      className="bank-card"
      style={{ "--card-accent": BAND_COLORS[audio.band] } as CSSProperties}
    >
      <div className="bank-card-head">
        <h3>{audio.name}</h3>
        <span className="category-badge">{audio.category}</span>
      </div>
      {audio.goalTagline && <p className="tagline">{audio.goalTagline}</p>}
      <div className="bank-badges">
        <span className="band-chip">{BAND_LABELS[audio.band]}</span>
        <span className={`category-badge bank-kind${audio.madeFor !== null ? " made-for" : ""}`}>{kind}</span>
      </div>
      <p className="bank-meta">
        {audio.layerCount} {audio.layerCount === 1 ? "layer" : "layers"} · target{" "}
        {audio.targetHz} Hz
      </p>
      {audio.basedOn && <p className="bank-meta">Based on {audio.basedOn}</p>}
      {notesPreview && <p className="bank-notes">{notesPreview}</p>}

      <div className="bank-actions">
        <button
          className="chip small roster-primary"
          aria-label={`Edit ${audio.name} in Studio`}
          onClick={() => openInStudio({ kind: "edit", audioId: audio.id })}
        >
          Edit in Studio
        </button>
        <button
          className="chip small"
          aria-label={`Duplicate ${audio.name}`}
          onClick={() => openInStudio({ kind: "copy", audioId: audio.id, madeFor: null })}
        >
          Duplicate
        </button>
        {assignable && (
          <button
            className="chip small"
            aria-label={`Assign ${audio.name}…`}
            aria-expanded={assignOpen}
            onClick={() => setAssignOpen((v) => !v)}
          >
            Assign…
          </button>
        )}
        <button
          className="chip small"
          aria-label={`Details of ${audio.name}`}
          aria-expanded={editOpen}
          onClick={() => setEditOpen((v) => !v)}
        >
          Details
        </button>
        <button
          className="chip small"
          aria-label={`Download ${audio.name}…`}
          aria-expanded={dlOpen}
          onClick={() => setDlOpen((v) => !v)}
        >
          Download…
        </button>
        <button className="chip small" aria-label={`Delete ${audio.name}`} onClick={() => void doDelete()}>
          Delete
        </button>
      </div>

      {dlOpen && (
        <div className="bank-download">
          <label className="bank-download-row">
            <span>Length</span>
            <select
              className="select"
              value={dlMin}
              disabled={exportBusy}
              aria-label="Export length in minutes"
              onChange={(e) => setDlMin(Number(e.target.value))}
            >
              {EXPORT_LENGTHS_MIN.map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </label>
          <p className="bank-download-note">320 kbps MP3 · stereo</p>
          {dlMin >= 45 && (
            <p className="export-warning">
              Long exports need a powerful device and can take a few minutes.
            </p>
          )}
          <button
            className="chip"
            disabled={exportBusy}
            onClick={() => void doDownload()}
          >
            {dlLabel}
          </button>
        </div>
      )}

      {assignable &&
        assignOpen &&
        (patients.length === 0 ? (
          <p className="library-note">No linked patients yet.</p>
        ) : (
          <div className="save-row">
            <select
              className="select"
              value={target}
              aria-label="Assign to patient"
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="all">All patients</option>
              {patients.map((p) => (
                <option key={p.patientId} value={p.patientId}>
                  {patientName(p)}
                </option>
              ))}
            </select>
            <button className="chip" disabled={busy} onClick={() => void doAssign()}>
              Confirm
            </button>
          </div>
        ))}

      {editOpen && (
        <div className="bank-edit">
          <input
            className="text-input"
            value={name}
            maxLength={60}
            aria-label="Audio name"
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="text-input"
            value={tagline}
            maxLength={90}
            placeholder="Goal tagline (optional)"
            aria-label="Goal tagline"
            onChange={(e) => setTagline(e.target.value)}
          />
          <select
            className="select"
            value={category}
            aria-label="Category"
            onChange={(e) => setCategory(e.target.value as AudioCategory)}
          >
            {AUDIO_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <textarea
            className="text-input"
            value={notes}
            rows={3}
            maxLength={500}
            placeholder="Notes (visible only to you)"
            aria-label="Notes"
            onChange={(e) => setNotes(e.target.value)}
          />
          <ScenePicker value={sceneId} onChange={setSceneId} />
          <button className="chip" disabled={busy} onClick={() => void doSave()}>
            Save changes
          </button>
        </div>
      )}
    </div>
  );
}
