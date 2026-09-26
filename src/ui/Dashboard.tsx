import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { Band } from "../audio/presets";
import { exportLabel, getExportJob, runMp3Export, subscribeExport } from "./mp3Export";
import { BAND_COLORS, BAND_LABELS } from "./bands";
import { useEntitlement } from "../lib/useEntitlement";
import {
  AUDIO_CATEGORIES,
  assignToAllPatients,
  assignToPatient,
  deleteAudio,
  listBank,
  listMyPatients,
  patientName,
  updateAudioMeta,
} from "../lib/clinician";
import type { AudioCategory, BankAudio, PatientLink } from "../lib/clinician";
import { PatientsTab } from "./PatientsTab";
import { PeopleTab } from "./PeopleTab";

/**
 * Clinician Dashboard (D-06): Patients tab (the table of the Clinician's
 * Patients with their Patient Status, each opening in a drawer with their
 * detail) and Audio Bank tab (filterable card grid of the clinician's
 * published sessions). The Admin also gets the Clinicians & Patients tab:
 * everyone on SwaraSanti in the same table + drawer (#13). The App renders this
 * only for clinicians/admins; RLS enforces every rule server-side regardless.
 */

const BANDS: readonly Band[] = ["delta", "theta", "alpha", "beta", "gamma"];

type DashboardTab = "patients" | "bank" | "people";

export function Dashboard() {
  const ent = useEntitlement();
  const [tab, setTab] = useState<DashboardTab>("patients");
  const [notice, setNotice] = useState<string | null>(null);

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

function BankTab({ flash }: { flash: (msg: string) => void }) {
  const [bank, setBank] = useState<BankAudio[]>([]);
  const [patients, setPatients] = useState<PatientLink[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"all" | AudioCategory>("all");
  const [band, setBand] = useState<"all" | Band>("all");
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const [bnk, pts] = await Promise.all([listBank(), listMyPatients()]);
      setBank(bnk);
      setPatients(pts);
      setError(null);
    } catch {
      setError("Could not load your audio bank — try again later.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Filters AND together: search (name/tagline/notes) × category × band.
  const q = search.trim().toLowerCase();
  const filtered = bank.filter((b) => {
    if (category !== "all" && b.category !== category) return false;
    if (band !== "all" && b.band !== band) return false;
    if (q) {
      const hay = `${b.name} ${b.goalTagline ?? ""} ${b.notes ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="dash-bank">
      <div className="bank-filters">
        <input
          className="text-input"
          placeholder="Search your bank…"
          value={search}
          aria-label="Search audio bank"
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="chips">
          <button
            className={`chip small ${category === "all" ? "selected" : ""}`}
            onClick={() => setCategory("all")}
          >
            All
          </button>
          {AUDIO_CATEGORIES.map((c) => (
            <button
              key={c}
              className={`chip small ${category === c ? "selected" : ""}`}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="chips">
          <button
            className={`chip small ${band === "all" ? "selected" : ""}`}
            onClick={() => setBand("all")}
          >
            All bands
          </button>
          {BANDS.map((b) => (
            <button
              key={b}
              className={`chip small ${band === b ? "selected" : ""}`}
              onClick={() => setBand(b)}
            >
              {BAND_LABELS[b]}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="library-note">{error}</p>}
      {!error && bank.length === 0 && (
        <p className="library-note">
          Your bank is empty — design a session in the Studio and save it here.
        </p>
      )}
      {!error && bank.length > 0 && filtered.length === 0 && (
        <p className="library-note">No audio matches these filters.</p>
      )}

      {!error && filtered.length > 0 && (
        <div className="bank-grid">
          {filtered.map((audio) => (
            <BankCard
              key={audio.id}
              audio={audio}
              patients={patients}
              flash={flash}
              onChange={() => void refresh()}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const EXPORT_LENGTHS_MIN = [5, 10, 15, 30, 45, 60] as const;

function BankCard({
  audio,
  patients,
  flash,
  onChange,
}: {
  audio: BankAudio;
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
    if (
      !window.confirm(
        `Delete "${audio.name}" from your bank? Patients lose access to it.`,
      )
    ) {
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
      style={{ "--card-accent": BAND_COLORS[audio.band] } as React.CSSProperties}
    >
      <div className="bank-card-head">
        <h3>{audio.name}</h3>
        <span className="category-badge">{audio.category}</span>
      </div>
      {audio.goalTagline && <p className="tagline">{audio.goalTagline}</p>}
      <span className="band-chip">{BAND_LABELS[audio.band]}</span>
      <p className="bank-meta">
        {audio.layerCount} {audio.layerCount === 1 ? "layer" : "layers"} · target{" "}
        {audio.targetHz} Hz
      </p>
      {notesPreview && <p className="bank-notes">{notesPreview}</p>}

      <div className="bank-actions">
        <button className="chip small" onClick={() => setAssignOpen((v) => !v)}>
          Assign…
        </button>
        <button className="chip small" onClick={() => setEditOpen((v) => !v)}>
          Edit
        </button>
        <button className="chip small" onClick={() => void doDelete()}>
          Delete
        </button>
        <button className="chip small" onClick={() => setDlOpen((v) => !v)}>
          Download…
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

      {assignOpen &&
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
          <button className="chip" disabled={busy} onClick={() => void doSave()}>
            Save changes
          </button>
        </div>
      )}
    </div>
  );
}
