import { useCallback, useEffect, useId, useState } from "react";
import { PRESETS } from "../audio/presets";
import {
  assignToPatient,
  getHiddenPresets,
  listBank,
  listEveryBank,
  listPatientAssignments,
  patientName,
  setPresetHidden,
  unassignFromPatient,
} from "../lib/clinician";
import type { AudioBank, PatientAssignment, PatientLink } from "../lib/clinician";
import { setPremiumGrant } from "../lib/accounts";
import { StatusPill } from "./PatientStatusPill";
import type { StatusReading } from "./PatientStatusPill";
import { ChangeUsernameForm } from "./ChangeUsernameForm";
import { PatientPassword } from "./PatientPassword";
import { ListeningReport } from "./ListeningReport";
import { RoleBadges } from "./roster";
import { personalUrlPath } from "../../supabase/functions/_shared/accountRules.ts";
import type { ShownRole } from "../../supabase/functions/_shared/accountRules.ts";

/**
 * One Patient in full, in the drawer of a people table (#12, #13): their
 * roles and Patient Status, every action on the Patient (Premium grant,
 * Personal URL and Username, password, disconnect), their Listening History
 * report, and the curation of Built-in sessions and Assigned audio. The
 * Admin acts exactly as the Patient's Clinician would, and assigns audio
 * from any Audio Bank.
 */

/** Who looks at the Patient: their own Clinician, or the Admin. */
export type PatientViewer = "clinician" | "admin";

const VIEWER_COPY: Record<
  PatientViewer,
  {
    premium: string;
    premiumNote: string;
    bankHeading: string;
    bankLabel: string;
    bankEmpty: string;
    /** What an Assignment from this list means beyond the Link; null when nothing. */
    bankNote: string | null;
  }
> = {
  clinician: {
    premium: "Premium from you",
    premiumNote: "Premium from you",
    bankHeading: "Add from bank",
    bankLabel: "Choose audio from your bank",
    bankEmpty: "Your bank is empty — design a session in the Studio and save it here.",
    bankNote: null,
  },
  admin: {
    premium: "Premium grant",
    premiumNote: "The Premium grant on their Link",
    bankHeading: "Add from an Audio Bank",
    bankLabel: "Choose audio from any Audio Bank",
    bankEmpty: "No Audio Bank has any audio yet.",
    // Admin Assignments stay Admin Assignments: least privilege, no Clinician
    // reads another bank's Custom Audio, and Link cleanup removes only the
    // Clinician's own audio.
    bankNote:
      "Audio from any bank but their clinician's stays with the patient after a disconnect or Transfer, and their clinician does not see it.",
  },
};

/** Copies text for the Clinician to paste elsewhere, and says whether it worked. */
async function copyText(text: string, flash: (msg: string) => void): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    flash("Copied ✓");
  } catch {
    flash("Could not copy — select it manually");
  }
}

export function PatientDetail({
  patient,
  roles,
  statusReading,
  zoneLabel,
  viewer,
  flash,
  onChange,
  onDisconnect,
}: {
  patient: PatientLink;
  /** Every role the Patient holds, for the badges in the header. */
  roles: readonly ShownRole[];
  /** Their Patient Status; null while unknown. */
  statusReading: StatusReading | null;
  /** How times in the Patient's zone are labelled (WIB, WITA, WIT). */
  zoneLabel: string;
  viewer: PatientViewer;
  flash: (msg: string) => void;
  /** Something shown in the table changed (assignments, Username, Premium). */
  onChange: () => Promise<void>;
  onDisconnect: () => void;
}) {
  const [hidden, setHidden] = useState<string[]>([]);
  const [assigned, setAssigned] = useState<PatientAssignment[]>([]);
  const [banks, setBanks] = useState<AudioBank[]>([]);
  const [bankPick, setBankPick] = useState("");
  // Presets with an in-flight visibility write — a second toggle is blocked
  // until the first settles, so a fast uncheck→recheck can't commit its two
  // independent requests out of order (DB 'hidden' while UI shows 'visible').
  const [busyPresets, setBusyPresets] = useState<Set<string>>(new Set());
  const name = patientName(patient);
  const copy = VIEWER_COPY[viewer];
  const premiumNoteId = useId();

  const load = useCallback(async () => {
    try {
      const [hid, asg, bnk] = await Promise.all([
        getHiddenPresets(patient.patientId),
        listPatientAssignments(patient.patientId),
        viewer === "admin"
          ? listEveryBank()
          : listBank().then((audios) => [{ ownerId: patient.clinicianId, ownerName: "Your bank", audios }]),
      ]);
      setHidden(hid);
      setAssigned(asg);
      setBanks(bnk);
      setBankPick((prev) => prev || bnk[0]?.audios[0]?.id || "");
    } catch {
      flash("Could not load patient details");
    }
    // flash is stable enough for this panel — recreating it must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient.patientId, patient.clinicianId, viewer]);

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
      await setPresetHidden(patient, presetId, hide);
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
      void onChange();
    } catch {
      flash("Could not unassign the audio");
    }
  };

  const assign = async () => {
    if (!bankPick) return;
    try {
      await assignToPatient(bankPick, patient.patientId);
      await load();
      void onChange();
      flash("Assigned ✓");
    } catch {
      flash("Could not assign the audio");
    }
  };

  return (
    <div className="patient-detail">
      <header className="patient-detail-head">
        <div className="patient-detail-title">
          <h3>{name}</h3>
          <RoleBadges roles={roles} />
          {statusReading && <StatusPill reading={statusReading} />}
        </div>
        <p className="patient-detail-meta">
          {[patient.username && `@${patient.username}`, patient.email, `times in ${zoneLabel}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <div className="patient-detail-actions">
          <PremiumGrant
            patientId={patient.patientId}
            premiumGrant={patient.premiumGrant}
            label={copy.premium}
            describedBy={premiumNoteId}
            flash={flash}
            onChange={onChange}
          />
          <button className="chip small danger" onClick={onDisconnect}>
            Disconnect
          </button>
        </div>
        <p className="library-note" id={premiumNoteId}>
          {copy.premiumNote}: every Premium feature, without a subscription. Their Account says “Premium from
          your clinician”.
        </p>
      </header>

      {patient.username !== null && (
        <>
          <PersonalUrlBlock
            patientId={patient.patientId}
            username={patient.username}
            flash={flash}
            onUsernameChange={() => void onChange()}
          />
          <PatientPassword patientId={patient.patientId} flash={flash} />
        </>
      )}

      <div className="detail-block">
        <h4>Listening history</h4>
        <ListeningReport
          userId={patient.patientId}
          firstName={patient.name?.trim().split(/\s+/)[0] || name}
          headingLevel={5}
        />
      </div>

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
        <h4>{copy.bankHeading}</h4>
        {banks.every((b) => b.audios.length === 0) ? (
          <p className="library-note">{copy.bankEmpty}</p>
        ) : (
          <div className="save-row">
            <select
              className="select"
              value={bankPick}
              aria-label={copy.bankLabel}
              onChange={(e) => setBankPick(e.target.value)}
            >
              {banks.length === 1
                ? banks[0].audios.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))
                : banks.map((bank) => (
                    <optgroup key={bank.ownerId} label={bank.ownerName}>
                      {bank.audios.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
            </select>
            <button className="chip" disabled={!bankPick} onClick={() => void assign()}>
              Assign
            </button>
          </div>
        )}
        {copy.bankNote && <p className="library-note">{copy.bankNote}</p>}
      </div>
    </div>
  );
}

/** The Premium grant on a Patient's Link, which their Clinician or the Admin switches (ADR-014). */
function PremiumGrant({
  patientId,
  premiumGrant,
  label,
  describedBy,
  flash,
  onChange,
}: {
  patientId: string;
  premiumGrant: boolean;
  label: string;
  /** Id of the text explaining the grant. */
  describedBy: string;
  flash: (msg: string) => void;
  onChange: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    const premium = !premiumGrant;
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
    <button
      className={`chip small${premiumGrant ? " selected" : ""}`}
      aria-pressed={premiumGrant}
      aria-describedby={describedBy}
      disabled={busy}
      onClick={() => void toggle()}
    >
      {premiumGrant && <span aria-hidden="true">✓ </span>}
      {label}
    </button>
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
