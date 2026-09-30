import { useCallback, useEffect, useId, useMemo, useState } from "react";
import type { ReactNode } from "react";
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
import type { AudioBank, BankAudio, PatientAssignment, PatientLink } from "../lib/clinician";
import { listTemplates } from "../lib/audioLibrary";
import type { CloudAudio } from "../lib/audioLibrary";
import { openInStudio } from "./studioRequest";
import { setPremiumGrant, transferPatients } from "../lib/accounts";
import { StatusPill } from "./PatientStatusPill";
import type { StatusReading } from "./PatientStatusPill";
import { ChangeUsernameForm } from "./ChangeUsernameForm";
import { AccountPassword } from "./AccountPassword";
import { AddUsernameLogin } from "./AddUsernameLogin";
import { ListeningReport } from "./ListeningReport";
import { RoleBadges } from "./roster";
import { TransferForm } from "./TransferForm";
import type { TransferCandidate } from "./TransferForm";
import { mayRevealOrResetPassword, personalUrlPath } from "../../supabase/functions/_shared/accountRules.ts";
import type { ShownRole } from "../../supabase/functions/_shared/accountRules.ts";

/**
 * One Patient in full, in the drawer of a people table (#12, #13): their
 * roles and Patient Status, every action on the Patient (Premium grant,
 * Personal URL and Username, password, disconnect, and the Admin's Transfer,
 * #15, and deletion, #17), their Listening History report, and the curation
 * of Built-in sessions and Assigned audio. The Admin acts exactly as the
 * Patient's Clinician would, and assigns audio from any Audio Bank. A Patient
 * without a Username gets one with a password here (#16). The password of a
 * Patient who is also a Clinician is the Admin's alone (ADR-015).
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

/**
 * Whether the signed-in User may reveal, reset or set this Patient's password
 * (ADR-015, ADR-021): the Admin always; the Patient's own Clinician (this
 * drawer only opens for them or the Admin) unless the Patient is a Clinician
 * too. A Clinician reads only their own Links, so an Inactive Clinician among
 * their Patients reads here as having no Patients; the server refuses them.
 */
function handlesPasswordOf(patient: PatientLink, role: "admin" | "clinician"): boolean {
  const account = { role: patient.role, clinicianOrigin: null, clinicianId: patient.clinicianId, patientCount: 0 };
  return mayRevealOrResetPassword({ actor: { id: patient.clinicianId, role }, account }).ok;
}

export function PatientDetail({
  patient,
  roles,
  statusReading,
  zoneLabel,
  viewer,
  viewerRole,
  flash,
  onChange,
  onDisconnect,
  clinicianRole,
  transferTargets,
  accountDeletion,
}: {
  patient: PatientLink;
  /** Every role the Patient holds, for the badges in the header. */
  roles: readonly ShownRole[];
  /** Their Patient Status; null while unknown. */
  statusReading: StatusReading | null;
  /** How times in the Patient's zone are labelled (WIB, WITA, WIT). */
  zoneLabel: string;
  viewer: PatientViewer;
  /**
   * The signed-in User's role: the Admin handles every Patient's password,
   * in their own Patients tab too, where they view as the Clinician.
   */
  viewerRole: "admin" | "clinician";
  flash: (msg: string) => void;
  /** Something shown in the table changed (assignments, Username, Premium, Clinician). */
  onChange: () => Promise<void>;
  onDisconnect: () => void;
  /** The Admin's management of their Clinician role, under the header. */
  clinicianRole?: ReactNode;
  /** Whom the Admin may Transfer the Patient to; without it, no Transfer. */
  transferTargets?: readonly TransferCandidate[];
  /** The Admin's deletion of the account, at the end; without it, no deletion. */
  accountDeletion?: ReactNode;
}) {
  const [transferring, setTransferring] = useState(false);
  /** A password the viewer just set with a new Username, shown once in the Password block. */
  const [justSetPassword, setJustSetPassword] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [assigned, setAssigned] = useState<PatientAssignment[]>([]);
  const [banks, setBanks] = useState<AudioBank[]>([]);
  /** The viewer's own Audio Bank, for the starting points of new audio. */
  const [ownAudios, setOwnAudios] = useState<BankAudio[]>([]);
  const [templates, setTemplates] = useState<CloudAudio[]>([]);
  const [bankPick, setBankPick] = useState("");
  const startFromId = useId();
  /** The Template or general audio a new design for this Patient starts from. */
  const [startFrom, setStartFrom] = useState("");
  // Presets with an in-flight visibility write — a second toggle is blocked
  // until the first settles, so a fast uncheck→recheck can't commit its two
  // independent requests out of order (DB 'hidden' while UI shows 'visible').
  const [busyPresets, setBusyPresets] = useState<Set<string>>(new Set());
  const name = patientName(patient);
  const copy = VIEWER_COPY[viewer];
  const handlesPassword = handlesPasswordOf(patient, viewerRole);
  const premiumNoteId = useId();

  const load = useCallback(async () => {
    try {
      const own = listBank();
      const [hid, asg, bnk, mine, tpl] = await Promise.all([
        getHiddenPresets(patient.patientId),
        listPatientAssignments(patient.patientId),
        viewer === "admin"
          ? listEveryBank()
          : own.then((audios) => [{ ownerId: patient.clinicianId, ownerName: "Your bank", audios }]),
        own,
        listTemplates(),
      ]);
      setHidden(hid);
      setAssigned(asg);
      setBanks(bnk);
      setOwnAudios(mine);
      setTemplates(tpl);
      setBankPick(
        (prev) => prev || bnk.flatMap((b) => b.audios).find(isGeneral)?.id || "",
      );
    } catch {
      flash("Could not load patient details");
    }
    // flash is stable enough for this panel — recreating it must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient.patientId, patient.clinicianId, viewer]);

  /** Custom Audio made for this Patient, in every bank the viewer reads. */
  const madeForThem = useMemo(
    () => banks.flatMap((b) => b.audios).filter((a) => a.madeFor === patient.patientId),
    [banks, patient.patientId],
  );
  /** Only general audio is assigned from a bank: personal audio is its Patient's, a Template everyone's. */
  const generalBanks = useMemo(
    () =>
      banks
        .map((bank) => ({ ...bank, audios: bank.audios.filter(isGeneral) }))
        .filter((bank) => bank.audios.length > 0),
    [banks],
  );
  const ownGeneral = useMemo(() => ownAudios.filter(isGeneral), [ownAudios]);
  const generalAssigned = assigned.filter((a) => a.madeFor === null);

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
    } catch (error) {
      // A stale list can still offer audio since made for someone else.
      const personal = error instanceof Object && "message" in error && String(error.message).includes("personal_audio");
      flash(personal ? "That audio was made for one patient. Duplicate it for anyone else." : "Could not assign the audio");
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
          {transferTargets && !transferring && (
            <button className="chip small" onClick={() => setTransferring(true)}>
              Transfer…
            </button>
          )}
        </div>
        <p className="library-note" id={premiumNoteId}>
          {copy.premiumNote}: every Premium feature, without a subscription. Their Account says “Premium from
          your clinician”.
        </p>
      </header>

      {transferTargets && transferring && (
        <div className="detail-block">
          <h4>Transfer to another clinician</h4>
          <TransferForm
            fromClinicianId={patient.clinicianId}
            patientIds={[patient.patientId]}
            candidates={transferTargets}
            submitLabel="Transfer"
            note={
              <>
                Their listening history, Premium grant, password and @username move with them. Audio assigned from
                their current clinician's bank and the sessions hidden for them are removed.
              </>
            }
            onSubmit={async (target) => {
              await transferPatients({ patientId: patient.patientId }, target.id);
              setTransferring(false);
              await onChange();
              flash(`${name} transferred to ${target.name} ✓`);
            }}
            onClose={() => setTransferring(false)}
          />
        </div>
      )}

      {clinicianRole}

      {patient.username !== null ? (
        <>
          <PersonalUrlBlock
            patientId={patient.patientId}
            username={patient.username}
            flash={flash}
            onUsernameChange={() => void onChange()}
          />
          {handlesPassword ? (
            <AccountPassword accountId={patient.patientId} owner="patient" flash={flash} justSet={justSetPassword} />
          ) : (
            <AdminOnlyPassword />
          )}
        </>
      ) : handlesPassword ? (
        <AddUsernameLogin
          patientId={patient.patientId}
          name={patient.name}
          onAdded={async (login) => {
            setJustSetPassword(login.password);
            await onChange();
            flash(`Username and password added ✓ Share them with ${name}.`);
          }}
        />
      ) : (
        <AdminOnlyPassword />
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
        <h4>Made for {name}</h4>
        {madeForThem.length === 0 ? (
          <p className="library-note">Nothing made for {name} yet.</p>
        ) : (
          <div className="library-list">
            {madeForThem.map((a) => (
              <div className="library-item" key={a.id}>
                <div className="library-item-info">
                  <span className="library-item-name">{a.name}</span>
                  {a.goalTagline && <span className="library-item-tagline">{a.goalTagline}</span>}
                </div>
                <span className="category-badge">{a.category}</span>
                <button
                  className="chip small"
                  aria-label={`Edit ${a.name} in Studio`}
                  onClick={() => openInStudio({ kind: "edit", audioId: a.id })}
                >
                  Edit in Studio
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="made-for-new">
          <button
            className="chip roster-primary"
            onClick={() => openInStudio({ kind: "new", madeFor: patient.patientId })}
          >
            <span aria-hidden>+ </span>New audio for {name}
          </button>
          {(templates.length > 0 || ownGeneral.length > 0) && (
            <div className="made-for-start">
              <label htmlFor={startFromId}>Start from…</label>
              {/* Opened by the button, not on change: arrow keys on a closed select change it. */}
              <select
                id={startFromId}
                className="select"
                value={startFrom}
                onChange={(e) => setStartFrom(e.target.value)}
              >
                <option value="">Choose a template or audio</option>
                {templates.length > 0 && (
                  <optgroup label="Templates">
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {ownGeneral.length > 0 && (
                  <optgroup label="Your general audio">
                    {ownGeneral.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <button
                className="chip small"
                disabled={!startFrom}
                onClick={() => openInStudio({ kind: "copy", audioId: startFrom, madeFor: patient.patientId })}
              >
                Open copy in Studio
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="detail-block">
        <h4>Assigned audio</h4>
        {generalAssigned.length === 0 ? (
          <p className="library-note">Nothing assigned yet.</p>
        ) : (
          <div className="library-list">
            {generalAssigned.map((a) => (
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
        {generalBanks.length === 0 ? (
          <p className="library-note">{copy.bankEmpty}</p>
        ) : (
          <div className="save-row">
            <select
              className="select"
              value={bankPick}
              aria-label={copy.bankLabel}
              onChange={(e) => setBankPick(e.target.value)}
            >
              {generalBanks.length === 1
                ? generalBanks[0].audios.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))
                : generalBanks.map((bank) => (
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

      {accountDeletion}
    </div>
  );
}

/** General Custom Audio: neither made for one Patient nor a Template. */
function isGeneral(audio: BankAudio): boolean {
  return audio.madeFor === null && !audio.isTemplate;
}

/** Where a Clinician's Patient who is also a Clinician has their password: with the Admin alone. */
function AdminOnlyPassword() {
  return (
    <div className="detail-block">
      <h4>Password</h4>
      <p className="library-note">
        They are a clinician too, so only the Admin can see, reset or set their password.
      </p>
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
