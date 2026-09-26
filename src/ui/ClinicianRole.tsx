import { useState } from "react";
import type { FormEvent } from "react";
import { AccountError, promoteToClinician, setPatientLimit } from "../lib/accounts";
import { maySetPatientLimit, PATIENT_LIMIT_MAX } from "../../supabase/functions/_shared/accountRules.ts";
import type {
  ClinicianOrigin,
  ProfileRole,
  PromoteToClinicianError,
  SetPatientLimitError,
} from "../../supabase/functions/_shared/accountRules.ts";
import { AccountPassword } from "./AccountPassword";

/**
 * The Admin's hand on someone's Clinician role (#14; ADR-014), in their drawer
 * on the Clinicians & Patients tab: "Make clinician" for a User without the
 * role; for a Clinician, where the role came from, their Patient limit with
 * "Raise patient limit", and the password of a Clinician the Admin created
 * (ADR-015). The server functions decide; the Account rules here only give
 * quick feedback.
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
  patientCount: number;
}

export function ClinicianRole({
  account,
  passwordShownAsPatient,
  flash,
  onChange,
}: {
  account: ClinicianRoleAccount;
  /** Their password already shows with their Personal URL, as a Patient's. */
  passwordShownAsPatient: boolean;
  flash: (msg: string) => void;
  /** The role or the limit changed: the table reloads. */
  onChange: () => Promise<void>;
}) {
  const [editingLimit, setEditingLimit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (account.role === "admin") return null;

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

  if (account.role === "user") {
    return (
      <div className="detail-block">
        <h4>Clinician role</h4>
        <div className="save-row">
          <span className="library-note">Not a clinician.</span>
          <button className="chip small" onClick={() => void promote()} disabled={busy}>
            {busy ? "Saving…" : "Make clinician"}
          </button>
        </div>
        <p className="library-note">
          Payments never take away a role you grant. They keep signing in with an email link until you reset
          their password here.
        </p>
        {error && (
          <p className="library-note form-error" role="alert">
            {error}
          </p>
        )}
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
          {!editingLimit && (
            <button className="chip small" onClick={() => setEditingLimit(true)}>
              Raise patient limit
            </button>
          )}
        </div>
        {account.clinicianOrigin === "admin" && (
          <p className="library-note">You granted this role: payments never take it away.</p>
        )}
        {editingLimit && (
          <PatientLimitForm
            account={account}
            onSaved={async (limit) => {
              setEditingLimit(false);
              await onChange();
              flash(`Patient limit ${limit} ✓`);
            }}
            onClose={() => setEditingLimit(false)}
          />
        )}
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

  // Every refusal must have a message (satisfies); lookups take any server code.
  const errors: Partial<Record<string, string>> = {
    not_allowed: "Only the Admin can change a patient limit.",
    not_clinician: "They no longer hold the clinician role.",
    invalid_limit: `Enter a whole number from ${account.patientCount} to ${PATIENT_LIMIT_MAX}.`,
  } satisfies Record<SetPatientLimitError, string>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const limit = value.trim() === "" ? Number.NaN : Number(value);
    // The Admin's own check, for quick feedback; the server checks again.
    const check = maySetPatientLimit({ actor: { role: "admin" }, account, limit });
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
          min={account.patientCount}
          max={PATIENT_LIMIT_MAX}
          step={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          required
        />
        <span className="field-hint">
          They have {account.patientCount} {account.patientCount === 1 ? "patient" : "patients"}. The limit
          applies to their next new patient.
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
