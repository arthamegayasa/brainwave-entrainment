import { useState } from "react";
import type { FormEvent } from "react";
import {
  AccountError,
  promoteToClinician,
  removeClinicianRole,
  setPatientLimit,
  transferPatients,
} from "../lib/accounts";
import { maySetPatientLimit, PATIENT_LIMIT_MAX } from "../../supabase/functions/_shared/accountRules.ts";
import type {
  ClinicianOrigin,
  ProfileRole,
  PromoteToClinicianError,
  SetPatientLimitError,
} from "../../supabase/functions/_shared/accountRules.ts";
import { AccountPassword } from "./AccountPassword";
import { patientsText, transferErrorMessage, TransferForm } from "./TransferForm";
import type { TransferCandidate } from "./TransferForm";

/**
 * The Admin's hand on someone's Clinician role (#14, #15; ADR-014), in their
 * drawer on the Clinicians & Patients tab: "Make clinician" for a User without
 * the role; for a Clinician, where the role came from, their Patient limit
 * with "Raise patient limit", "Transfer patients…", "Remove clinician role"
 * (after choosing who takes over their Patients), and the password of a
 * Clinician the Admin created (ADR-015); for an Inactive Clinician, the
 * Transfer of their unmonitored Patients. The server functions decide; the
 * Account rules here only give quick feedback.
 */

export const ORIGIN_NAMES: Record<ClinicianOrigin, string> = {
  subscription: "Subscription",
  admin: "Granted by Admin",
};

// Every refusal must have a message (satisfies); lookups take any server code.
const PROMOTE_ERRORS: Partial<Record<string, string>> = {
  not_allowed: "Only the Admin can make someone a clinician.",
  already_clinician: "They already hold the clinician role.",
} satisfies Record<PromoteToClinicianError, string>;
const UNEXPECTED_ERROR = "Could not save — try again later.";

/** Someone in the Admin's drawer, as their Clinician role reads. */
export interface ClinicianRoleAccount extends ProfileRole {
  userId: string;
  name: string;
  patientLimit: number;
  /** Their own Patients. */
  patientIds: readonly string[];
  /** Whether they are someone's Patient, which they stay after losing the role. */
  isPatient: boolean;
}

/** The form open under the role's summary. */
type Panel = "limit" | "transfer" | "remove" | null;

/** What the Admin reads before a Transfer of all of someone's Patients. */
const TRANSFER_NOTE =
  "Each keeps their listening history, Premium grant, password and @username. Audio assigned from this clinician's bank and the sessions hidden for them are removed.";

export function ClinicianRole({
  account,
  passwordShownAsPatient,
  transferTargets,
  flash,
  onChange,
}: {
  account: ClinicianRoleAccount;
  /** Their password already shows with their Personal URL, as a Patient's. */
  passwordShownAsPatient: boolean;
  /** Whom the Admin may Transfer their Patients to. */
  transferTargets: readonly TransferCandidate[];
  flash: (msg: string) => void;
  /** The role, the limit or their Patients changed: the table reloads. */
  onChange: () => Promise<void>;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (account.role === "admin") return null;

  const patientCount = account.patientIds.length;
  const afterRemoval = account.isPatient
    ? `${account.name} is no longer a clinician and stays their own clinician's patient.`
    : `${account.name} becomes a Regular.${
        account.clinicianOrigin === "admin"
          ? " Their password copy is deleted: they sign in with an email link, like any Regular."
          : ""
      }`;

  const promote = async () => {
    if (
      !window.confirm(
        `Make ${account.name} a clinician? They can add their own patients (up to ${account.patientLimit}) and build an Audio Bank. You grant the role, so payments never take it away.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await promoteToClinician(account.userId);
      await onChange();
      flash(`${account.name} is now a clinician ✓`);
    } catch (err) {
      const code = err instanceof AccountError ? err.code : "";
      setError(PROMOTE_ERRORS[code] ?? UNEXPECTED_ERROR);
    } finally {
      setBusy(false);
    }
  };

  /** Without Patients the role goes after a confirm; with them, only through the Transfer form. */
  const removeRole = async () => {
    if (patientCount > 0) {
      setPanel("remove");
      return;
    }
    if (!window.confirm(`Remove ${account.name}'s clinician role? ${afterRemoval}`)) return;
    setBusy(true);
    setError(null);
    try {
      await removeClinicianRole(account.userId, null);
      await onChange();
      flash(`${account.name} is no longer a clinician ✓`);
    } catch (err) {
      setError(transferErrorMessage(err, "", 0));
    } finally {
      setBusy(false);
    }
  };

  const transferForm = (
    <TransferForm
      fromClinicianId={account.userId}
      patientIds={account.patientIds}
      candidates={transferTargets}
      submitLabel={`Transfer ${patientsText(patientCount)}`}
      note={TRANSFER_NOTE}
      onSubmit={async (target) => {
        const moved = await transferPatients({ clinicianId: account.userId }, target.id);
        setPanel(null);
        await onChange();
        flash(`${patientsText(moved)} transferred to ${target.name} ✓`);
      }}
      onClose={() => setPanel(null)}
    />
  );

  const errorLine = error && (
    <p className="library-note form-error" role="alert">
      {error}
    </p>
  );

  if (account.role === "user") {
    return (
      <div className="detail-block">
        <h4>Clinician role</h4>
        <div className="save-row">
          <span className="library-note">
            {patientCount === 0
              ? "Not a clinician."
              : `Inactive: ${patientCount === 1 ? "their patient has" : `their ${patientCount} patients have`} no active clinician.`}
          </span>
          <button className="chip small" onClick={() => void promote()} disabled={busy}>
            {busy ? "Saving…" : "Make clinician"}
          </button>
          {patientCount > 0 && panel === null && (
            <button className="chip small" onClick={() => setPanel("transfer")}>
              Transfer patients…
            </button>
          )}
        </div>
        <p className="library-note">
          Payments never take away a role you grant. They keep signing in with an email link until you reset
          their password here.
        </p>
        {panel === "transfer" && transferForm}
        {errorLine}
      </div>
    );
  }

  return (
    <>
      <div className="detail-block">
        <h4>Clinician role</h4>
        <div className="save-row">
          <span className="library-note">
            {account.clinicianOrigin ? ORIGIN_NAMES[account.clinicianOrigin] : "Origin not recorded"} · Patient limit{" "}
            <strong>{account.patientLimit}</strong>
          </span>
        </div>
        {account.clinicianOrigin === "admin" && (
          <p className="library-note">You granted this role: payments never take it away.</p>
        )}
        {panel === null && (
          <div className="save-row">
            <button className="chip small" onClick={() => setPanel("limit")}>
              Raise patient limit
            </button>
            {patientCount > 0 && (
              <button className="chip small" onClick={() => setPanel("transfer")}>
                Transfer patients…
              </button>
            )}
            <button className="chip small danger" onClick={() => void removeRole()} disabled={busy}>
              {busy ? "Saving…" : "Remove clinician role"}
            </button>
          </div>
        )}
        {panel === "limit" && (
          <PatientLimitForm
            account={account}
            onSaved={async (limit) => {
              setPanel(null);
              await onChange();
              flash(`Patient limit ${limit} ✓`);
            }}
            onClose={() => setPanel(null)}
          />
        )}
        {panel === "transfer" && transferForm}
        {panel === "remove" && (
          <TransferForm
            fromClinicianId={account.userId}
            patientIds={account.patientIds}
            candidates={transferTargets}
            submitLabel="Transfer and remove role"
            note={`First their ${patientsText(patientCount)} move to the clinician you choose. ${TRANSFER_NOTE} Then ${afterRemoval}`}
            onSubmit={async (target) => {
              await removeClinicianRole(account.userId, target.id);
              setPanel(null);
              await onChange();
              flash(`${account.name} is no longer a clinician; ${target.name} has their patients ✓`);
            }}
            onClose={() => setPanel(null)}
          />
        )}
        {errorLine}
      </div>
      {account.clinicianOrigin === "admin" && !passwordShownAsPatient && (
        <AccountPassword accountId={account.userId} owner="clinician" flash={flash} />
      )}
    </>
  );
}

function PatientLimitForm({
  account,
  onSaved,
  onClose,
}: {
  account: ClinicianRoleAccount;
  onSaved: (limit: number) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(String(account.patientLimit));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const patientCount = account.patientIds.length;

  // Every refusal must have a message (satisfies); lookups take any server code.
  const errors: Partial<Record<string, string>> = {
    not_allowed: "Only the Admin can change a patient limit.",
    not_clinician: "They no longer hold the clinician role.",
    invalid_limit: `Enter a whole number from ${patientCount} to ${PATIENT_LIMIT_MAX}.`,
  } satisfies Record<SetPatientLimitError, string>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const limit = value.trim() === "" ? Number.NaN : Number(value);
    // The Admin's own check, for quick feedback; the server checks again.
    const check = maySetPatientLimit({ actor: { role: "admin" }, account: { role: account.role, patientCount }, limit });
    if (!check.ok) {
      setError(errors[check.reason] ?? UNEXPECTED_ERROR);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await setPatientLimit(account.userId, limit);
      await onSaved(limit);
    } catch (err) {
      const code = err instanceof AccountError ? err.code : "";
      setError(errors[code] ?? UNEXPECTED_ERROR);
      setBusy(false);
    }
  };

  return (
    <form className="new-patient-form" onSubmit={(e) => void submit(e)} noValidate>
      <label>
        Patient limit
        <input
          className="text-input"
          type="number"
          inputMode="numeric"
          min={patientCount}
          max={PATIENT_LIMIT_MAX}
          step={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          required
        />
        <span className="field-hint">
          They have {patientsText(patientCount)}. The limit applies to their next new or Transferred
          patient.
        </span>
      </label>
      {error && (
        <p className="library-note form-error" role="alert">
          {error}
        </p>
      )}
      <div className="save-row">
        <button type="submit" className="chip" disabled={busy}>
          {busy ? "Saving…" : "Save limit"}
        </button>
        <button type="button" className="chip" onClick={onClose} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
