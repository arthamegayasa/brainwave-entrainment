import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { AccountError } from "../lib/accounts";
import { mayTransferPatients, patientLimitOf } from "../../supabase/functions/_shared/accountRules.ts";
import type {
  RemoveClinicianRoleError,
  TransferTarget,
} from "../../supabase/functions/_shared/accountRules.ts";

/**
 * Choosing who takes over Patients (#15; ADR-014), in the Admin's drawer: to
 * Transfer one Patient or every Patient of a Clinician, and before removing
 * someone's Clinician role. It offers everyone the Account rules let take
 * these Patients (Clinicians and the Admin); someone whose Patient limit has
 * no room for all of them shows as full. The server functions decide again.
 */

/** Someone who may take over Patients, as the Admin's people list reads them. */
export interface TransferCandidate extends TransferTarget {
  name: string;
}

/** "1 patient", "3 patients". */
export function patientsText(count: number): string {
  return count === 1 ? "1 patient" : `${count} patients`;
}

/** "Sari Dewi · 28 / 30", "Artha (Admin) · 4 patients", "… · full". */
export function candidateLabel(c: TransferCandidate, full: boolean): string {
  const limit = patientLimitOf(c);
  const load = limit === null ? patientsText(c.patientCount) : `${c.patientCount} / ${limit}`;
  return `${c.name}${c.role === "admin" ? " (Admin)" : ""} · ${load}${full ? " · full" : ""}`;
}

/**
 * What went wrong with a Transfer, or with removing a Clinician role, for the
 * Admin to read; `targetName` is who was to take over `count` Patients.
 */
export function transferErrorMessage(err: unknown, targetName: string, count: number): string {
  // Every refusal must have a message (satisfies); lookups take any server code.
  const messages: Partial<Record<string, string>> = {
    not_allowed: "Only the Admin can do this.",
    not_linked: "Nobody left to transfer: the list changed meanwhile.",
    target_not_clinician: `${targetName} no longer holds the clinician role.`,
    same_clinician: `They are already with ${targetName}.`,
    target_is_patient: `${targetName} is one of these patients: choose someone else.`,
    patient_limit_reached: `${targetName} has no room for ${count === 1 ? "1 more patient" : `${count} more patients`}. Raise their limit or choose someone else.`,
    not_clinician: "They no longer hold the clinician role.",
    transfer_target_required: "They have patients now: choose who takes them over.",
  } satisfies Record<RemoveClinicianRoleError, string>;
  const code = err instanceof AccountError ? err.code : "";
  return messages[code] ?? "Could not save — try again later.";
}

export function TransferForm({
  fromClinicianId,
  patientIds,
  candidates,
  submitLabel,
  note,
  onSubmit,
  onClose,
}: {
  /** The Patients' current Clinician. */
  fromClinicianId: string;
  /** The Patients that move: one, or all of that Clinician's. */
  patientIds: readonly string[];
  candidates: readonly TransferCandidate[];
  submitLabel: string;
  /** What moves with the Patients and what goes, under the list. */
  note: ReactNode;
  /** Makes the Transfer; a refusal arrives as an AccountError. */
  onSubmit: (target: TransferCandidate) => Promise<void>;
  onClose: () => void;
}) {
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = candidates.flatMap((candidate) => {
    const check = mayTransferPatients({ actor: { role: "admin" }, fromClinicianId, patientIds, target: candidate });
    if (check.ok) return [{ candidate, full: false }];
    return check.reason === "patient_limit_reached" ? [{ candidate, full: true }] : [];
  });
  const target = options.find((o) => o.candidate.id === targetId && !o.full)?.candidate ?? null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (target === null) {
      setError("Choose who takes over.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(target);
    } catch (err) {
      setError(transferErrorMessage(err, target.name, patientIds.length));
      setBusy(false);
    }
  };

  if (options.length === 0) {
    return (
      <div className="new-patient-form">
        <p className="library-note">
          No other clinician can take them. Create a clinician or promote someone first.
        </p>
        <div className="save-row">
          <button type="button" className="chip" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="new-patient-form" onSubmit={(e) => void submit(e)} noValidate>
      <label>
        Transfer to
        <select
          className="select"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          autoFocus
          required
        >
          <option value="">Choose a clinician…</option>
          {options.map(({ candidate, full }) => (
            <option key={candidate.id} value={candidate.id} disabled={full}>
              {candidateLabel(candidate, full)}
            </option>
          ))}
        </select>
        <span className="field-hint">{note}</span>
      </label>
      {error && (
        <p className="library-note form-error" role="alert">
          {error}
        </p>
      )}
      <div className="save-row">
        <button type="submit" className="chip" disabled={busy}>
          {busy ? "Transferring…" : submitLabel}
        </button>
        <button type="button" className="chip" onClick={onClose} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
