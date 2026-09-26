import { useState } from "react";
import { AccountError, deleteAccount } from "../lib/accounts";
import { audioBankSize } from "../lib/clinician";
import { mayDeleteAccount } from "../../supabase/functions/_shared/accountRules.ts";
import type { AccountRole, DeleteAccountError } from "../../supabase/functions/_shared/accountRules.ts";

/**
 * The Admin deletes someone's account (#17; ADR-014, ADR-022), at the end of
 * their drawer on the Clinicians & Patients tab, after a confirmation step
 * that says what goes and what stays. Never offered for the Admin account;
 * while Patients are still Linked to them, the Admin Transfers those first.
 * The delete-account server function decides; the Account rules here only
 * give quick feedback.
 */

// Every refusal must have a message (satisfies); lookups take any server code.
const DELETE_ERRORS: Partial<Record<string, string>> = {
  not_allowed: "Only the Admin can delete an account.",
  account_is_admin: "The Admin account can't be deleted.",
  has_patients: "They have patients now. Transfer them first.",
} satisfies Record<DeleteAccountError, string>;
const UNEXPECTED_ERROR = "Could not delete the account — try again later.";

/** Someone in the Admin's drawer, as the deletion reads them. */
export interface DeletableAccount {
  userId: string;
  name: string;
  role: AccountRole;
  username: string | null;
  /** Their Clinician's name while they are a Patient; null otherwise. */
  clinicianName: string | null;
  /** Patients still Linked to them. */
  patientCount: number;
}

export function DeleteAccount({
  account,
  onDeleted,
}: {
  account: DeletableAccount;
  /** The account is gone: the table reloads and the drawer closes. */
  onDeleted: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Whether they created Custom Audio: a Clinician, or a former one (#15);
   * null until counted. Assumed when the count fails.
   */
  const [ownsAudio, setOwnsAudio] = useState<boolean | null>(null);

  const allowed = mayDeleteAccount({ actor: { role: "admin" }, account });
  if (!allowed.ok && allowed.reason === "account_is_admin") return null;
  const { patientCount } = account;

  const confirm = () => {
    setConfirming(true);
    setOwnsAudio(null);
    audioBankSize(account.userId).then(
      (size) => setOwnsAudio(size > 0),
      () => setOwnsAudio(true),
    );
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(account.userId);
    } catch (err) {
      const code = err instanceof AccountError ? err.code : "";
      setError(DELETE_ERRORS[code] ?? UNEXPECTED_ERROR);
      setBusy(false);
      return;
    }
    await onDeleted();
  };

  return (
    <div className="detail-block">
      <h4>Delete account</h4>
      {!allowed.ok && allowed.reason === "has_patients" ? (
        <p className="library-note">
          {patientCount === 1 ? "Their patient is" : `Their ${patientCount} patients are`} still linked to them.
          Transfer {patientCount === 1 ? "that patient" : "them"} first; then you can delete the account.
        </p>
      ) : !confirming ? (
        <div className="save-row">
          <span className="library-note">Removes the account and its listening history for good.</span>
          <button className="chip small danger" onClick={confirm}>
            Delete account…
          </button>
        </div>
      ) : (
        <>
          <p className="library-note">
            <strong>Delete {account.name}'s account? This can't be undone.</strong> Removed with it: their listening
            history (plays and downloads){account.clinicianName ? `, their link to ${account.clinicianName}` : ""} and
            the stored copy of their password, if there is one.
            {account.username && ` No one else can take @${account.username} for 30 days.`} Password views of their
            password stay in the log, shown as a deleted account.
            {ownsAudio &&
              " Audio they created that is still assigned to someone, or published as a template, moves to your Audio Bank; the rest of their Audio Bank is deleted."}
          </p>
          <div className="save-row">
            <button className="chip small danger" onClick={() => void remove()} disabled={busy || ownsAudio === null}>
              {busy ? "Deleting…" : "Delete account"}
            </button>
            <button
              className="chip small"
              onClick={() => {
                setConfirming(false);
                setError(null);
              }}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </>
      )}
      {error && (
        <p className="library-note form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
