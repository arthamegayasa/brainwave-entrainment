import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { PRESETS } from "../audio/presets";
import type { Band } from "../audio/presets";
import { exportLabel, getExportJob, runMp3Export, subscribeExport } from "./mp3Export";
import { BAND_COLORS, BAND_LABELS } from "./bands";
import { useEntitlement } from "../lib/useEntitlement";
import {
  AUDIO_CATEGORIES,
  assignToAllPatients,
  assignToPatient,
  deleteAudio,
  getHiddenPresets,
  listAssignmentCounts,
  listBank,
  listMyPatients,
  listPatientAssignments,
  setPresetHidden,
  unassignFromPatient,
  updateAudioMeta,
} from "../lib/clinician";
import type {
  AudioCategory,
  BankAudio,
  PatientAssignment,
  PatientLink,
} from "../lib/clinician";
import { disconnectPatient, setPremiumGrant } from "../lib/accounts";
import { NewPatientForm } from "./NewPatientForm";
import { ChangeUsernameForm } from "./ChangeUsernameForm";
import { PatientPassword } from "./PatientPassword";
import { personalUrlPath } from "../../supabase/functions/_shared/accountRules.ts";

/**
 * Clinician Dashboard (D-06): Patients tab (linked patients with their
 * Premium grant, per-patient preset curation + assignments) and Audio Bank
 * tab (filterable card grid of the clinician's published sessions). The App
 * renders this only for clinicians/admins; RLS enforces every rule
 * server-side regardless.
 */

/** How a Patient reads in the Dashboard: their name, else their email. */
function patientName(patient: PatientLink): string {
  return patient.name ?? patient.email ?? "Unnamed patient";
}

/** Copies text for the Clinician to paste elsewhere, and says whether it worked. */
async function copyText(text: string, flash: (msg: string) => void): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    flash("Copied ✓");
  } catch {
    flash("Could not copy — select it manually");
  }
}

const BANDS: readonly Band[] = ["delta", "theta", "alpha", "beta", "gamma"];

export function Dashboard() {
  const ent = useEntitlement();
  const [tab, setTab] = useState<"patients" | "bank">("patients");
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
      </div>

      {tab === "patients" ? (
        <PatientsTab flash={flash} patientLimit={ent.patientLimit} />
      ) : (
        <BankTab flash={flash} />
      )}

      {notice && <div className="notice">{notice}</div>}
    </section>
  );
}

/* ── Patients tab ─────────────────────────────────────────────────────── */

function PatientsTab({
  flash,
  patientLimit,
}: {
  flash: (msg: string) => void;
  /** Most Patients this Clinician may have; null means no limit (the Admin). */
  patientLimit: number | null;
}) {
  const [patients, setPatients] = useState<PatientLink[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [pts, cnts] = await Promise.all([listMyPatients(), listAssignmentCounts()]);
      setPatients(pts);
      setCounts(cnts);
      setError(null);
    } catch {
      setError("Could not load your patients — try again later.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const disconnect = async (patient: PatientLink) => {
    const label = patientName(patient);
    if (
      !window.confirm(
        `Disconnect ${label}? They keep their account and sign-in, but lose your assigned audio, curation and Premium, and you no longer see their data.`,
      )
    ) {
      return;
    }
    try {
      await disconnectPatient(patient.patientId);
      if (selected === patient.patientId) setSelected(null);
      await refresh();
      flash("Patient disconnected");
    } catch {
      flash("Could not disconnect the patient");
    }
  };

  // create-patient enforces the limit on the server; here it only hides the
  // button.
  const capped = patientLimit !== null && patients.length >= patientLimit;
  const selectedPatient = patients.find((p) => p.patientId === selected) ?? null;

  return (
    <div className="dash-patients">
      <div className="library-section">
        <div className="library-section-head">
          <h2>Add a patient</h2>
          {!capped && !creating && (
            <button className="chip" onClick={() => setCreating(true)}>
              + New patient
            </button>
          )}
        </div>
        {capped && (
          <p className="library-note">
            Patient limit reached ({patientLimit}) — contact us to expand.
          </p>
        )}
        {creating && (
          <NewPatientForm onCreated={() => void refresh()} onClose={() => setCreating(false)} />
        )}
      </div>

      <div className="library-section">
        <h2>Patients</h2>
        {error && <p className="library-note">{error}</p>}
        {!error && patients.length === 0 && (
          <p className="library-note">No patients yet — add one with + New patient.</p>
        )}
        {patients.length > 0 && (
          <div className="library-list">
            {patients.map((p) => (
              <div
                className={`library-item patient-row ${selected === p.patientId ? "selected" : ""}`}
                key={p.patientId}
              >
                <button
                  className="patient-select"
                  onClick={() =>
                    setSelected(selected === p.patientId ? null : p.patientId)
                  }
                >
                  <span className="library-item-name">{patientName(p)}</span>
                  <span className="library-item-tagline">
                    {p.username && `@${p.username} · `}
                    linked {new Date(p.linkedAt).toLocaleDateString()} ·{" "}
                    {counts[p.patientId] ?? 0} assigned
                  </span>
                </button>
                <button
                  className="saved-del"
                  aria-label={`Disconnect ${patientName(p)}`}
                  onClick={() => void disconnect(p)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        {selectedPatient && (
          <PatientDetail
            key={selectedPatient.patientId}
            patient={selectedPatient}
            flash={flash}
            onAssignmentsChange={() => void refresh()}
            onUsernameChange={() => void refresh()}
            onPremiumChange={refresh}
          />
        )}
      </div>
    </div>
  );
}

function PatientDetail({
  patient,
  flash,
  onAssignmentsChange,
  onUsernameChange,
  onPremiumChange,
}: {
  patient: PatientLink;
  flash: (msg: string) => void;
  onAssignmentsChange: () => void;
  onUsernameChange: () => void;
  onPremiumChange: () => Promise<void>;
}) {
  const [hidden, setHidden] = useState<string[]>([]);
  const [assigned, setAssigned] = useState<PatientAssignment[]>([]);
  const [bank, setBank] = useState<BankAudio[]>([]);
  const [bankPick, setBankPick] = useState("");
  // Presets with an in-flight visibility write — a second toggle is blocked
  // until the first settles, so a fast uncheck→recheck can't commit its two
  // independent requests out of order (DB 'hidden' while UI shows 'visible').
  const [busyPresets, setBusyPresets] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const [hid, asg, bnk] = await Promise.all([
        getHiddenPresets(patient.patientId),
        listPatientAssignments(patient.patientId),
        listBank(),
      ]);
      setHidden(hid);
      setAssigned(asg);
      setBank(bnk);
      setBankPick((prev) => prev || bnk[0]?.id || "");
    } catch {
      flash("Could not load patient details");
    }
    // flash is stable enough for this panel — recreating it must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient.patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  // CHECKED = VISIBLE: unchecking inserts the hidden row, checking removes it.
  const togglePreset = async (presetId: string, visible: boolean) => {
    if (busyPresets.has(presetId)) return; // serialize per-preset writes
    const hide = !visible;
    setHidden((prev) =>
      hide ? [...prev, presetId] : prev.filter((id) => id !== presetId),
    );
    setBusyPresets((prev) => new Set(prev).add(presetId));
    try {
      await setPresetHidden(patient.patientId, presetId, hide);
    } catch {
      flash("Could not update visibility");
      void load();
    } finally {
      setBusyPresets((prev) => {
        const next = new Set(prev);
        next.delete(presetId);
        return next;
      });
    }
  };

  const unassign = async (audioId: string) => {
    try {
      await unassignFromPatient(audioId, patient.patientId);
      await load();
      onAssignmentsChange();
    } catch {
      flash("Could not unassign the audio");
    }
  };

  const assign = async () => {
    if (!bankPick) return;
    try {
      await assignToPatient(bankPick, patient.patientId);
      await load();
      onAssignmentsChange();
      flash("Assigned ✓");
    } catch {
      flash("Could not assign the audio");
    }
  };

  return (
    <div className="patient-detail">
      <h3>{patientName(patient)}</h3>

      <PremiumGrant
        patientId={patient.patientId}
        premiumGrant={patient.premiumGrant}
        flash={flash}
        onChange={onPremiumChange}
      />

      {patient.username !== null && (
        <>
          <PersonalUrlBlock
            patientId={patient.patientId}
            username={patient.username}
            flash={flash}
            onUsernameChange={onUsernameChange}
          />
          <PatientPassword patientId={patient.patientId} flash={flash} />
        </>
      )}

      <div className="detail-block">
        <h4>Built-in sessions</h4>
        <p className="library-note">
          Uncheck a session to hide it from this patient's app.
        </p>
        <div className="preset-checks">
          {PRESETS.map((preset) => {
            const visible = !hidden.includes(preset.id);
            return (
              <label className="preset-check" key={preset.id}>
                <input
                  type="checkbox"
                  checked={visible}
                  disabled={busyPresets.has(preset.id)}
                  onChange={(e) => void togglePreset(preset.id, e.target.checked)}
                />
                <span aria-hidden>{preset.emoji}</span> {preset.name}
              </label>
            );
          })}
        </div>
      </div>

      <div className="detail-block">
        <h4>Assigned audio</h4>
        {assigned.length === 0 ? (
          <p className="library-note">Nothing assigned yet.</p>
        ) : (
          <div className="library-list">
            {assigned.map((a) => (
              <div className="library-item" key={a.audioId}>
                <div className="library-item-info">
                  <span className="library-item-name">{a.name}</span>
                  {a.goalTagline && (
                    <span className="library-item-tagline">{a.goalTagline}</span>
                  )}
                </div>
                <span className="category-badge">{a.category}</span>
                <button
                  className="saved-del"
                  aria-label={`Unassign ${a.name}`}
                  onClick={() => void unassign(a.audioId)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="detail-block">
        <h4>Add from bank</h4>
        {bank.length === 0 ? (
          <p className="library-note">
            Your bank is empty — design a session in the Studio and save it
            here.
          </p>
        ) : (
          <div className="save-row">
            <select
              className="select"
              value={bankPick}
              aria-label="Choose audio from your bank"
              onChange={(e) => setBankPick(e.target.value)}
            >
              {bank.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <button className="chip" disabled={!bankPick} onClick={() => void assign()}>
              Assign
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** The Premium grant on a Patient's Link, which their Clinician or the Admin switches (ADR-014). */
function PremiumGrant({
  patientId,
  premiumGrant,
  flash,
  onChange,
}: {
  patientId: string;
  premiumGrant: boolean;
  flash: (msg: string) => void;
  onChange: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  const toggle = async (premium: boolean) => {
    setBusy(true);
    try {
      await setPremiumGrant(patientId, premium);
      await onChange();
      flash(premium ? "Premium on ✓" : "Premium off");
    } catch {
      flash("Could not change Premium — try again later.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="detail-block">
      <h4>Premium</h4>
      <label className="preset-check">
        <input
          type="checkbox"
          checked={premiumGrant}
          disabled={busy}
          onChange={(e) => void toggle(e.target.checked)}
        />
        Premium from you
      </label>
      <p className="library-note">
        Every Premium feature, without a subscription. Their Account says
        “Premium from your clinician”.
      </p>
    </div>
  );
}

/** A Patient's Personal URL to copy, and the change of Username behind it. */
function PersonalUrlBlock({
  patientId,
  username,
  flash,
  onUsernameChange,
}: {
  patientId: string;
  username: string;
  flash: (msg: string) => void;
  onUsernameChange: () => void;
}) {
  const [changing, setChanging] = useState(false);
  const personalUrl = `${window.location.origin}${personalUrlPath(username)}`;

  const changed = (next: string) => {
    setChanging(false);
    onUsernameChange();
    flash(`Username changed to @${next} ✓ The old Personal URL still works.`);
  };

  return (
    <div className="detail-block">
      <h4>Personal URL</h4>
      <div className="save-row">
        <span className="personal-url-address">{personalUrl}</span>
        <button className="chip small" onClick={() => void copyText(personalUrl, flash)}>
          Copy link
        </button>
        {!changing && (
          <button className="chip small" onClick={() => setChanging(true)}>
            Change username
          </button>
        )}
      </div>
      <p className="library-note">
        Your patient opens this address and types their password.
      </p>
      {changing && (
        <ChangeUsernameForm
          accountId={patientId}
          current={username}
          onChanged={changed}
          onClose={() => setChanging(false)}
        />
      )}
    </div>
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
