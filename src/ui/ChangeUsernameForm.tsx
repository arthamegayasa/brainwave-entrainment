import { useState } from "react";
import type { FormEvent } from "react";
import { AccountError, changeUsername } from "../lib/accounts";
import {
  isValidUsername,
  normalizeUsername,
  USERNAME_LOCK_DAYS,
} from "../../supabase/functions/_shared/accountRules.ts";
import type { ChangeUsernameError } from "../../supabase/functions/_shared/accountRules.ts";
import { USERNAME_REFUSALS } from "./usernameMessages";

/**
 * Change a Patient's Username (#7, ADR-016), for their Clinician or the Admin.
 * The old Personal URL keeps redirecting to the new one until another account
 * claims the old Username, which nobody else can for 30 days. The server
 * decides; this form only checks the Username first for quick feedback.
 */

// Every refusal must have a message (satisfies); lookups take any server code.
const ERRORS: Partial<Record<string, string>> = {
  ...USERNAME_REFUSALS,
  not_allowed: "Only this patient's clinician can change their username.",
  no_username: "This patient has no username to change.",
} satisfies Record<ChangeUsernameError, string>;
const UNEXPECTED_ERROR = "Could not change the username — try again later.";

export function ChangeUsernameForm({
  accountId,
  current,
  onChanged,
  onClose,
}: {
  accountId: string;
  /** The account's Username now. */
  current: string;
  onChanged: (username: string) => void;
  onClose: () => void;
}) {
  const [username, setUsername] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next = normalizeUsername(username);
    if (next === current) {
      onClose();
      return;
    }
    if (!isValidUsername(next)) {
      setError(USERNAME_REFUSALS.invalid_username);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await changeUsername(accountId, next);
      onChanged(result.username);
    } catch (err) {
      const code = err instanceof AccountError ? err.code : "";
      setError(ERRORS[code] ?? UNEXPECTED_ERROR);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="new-patient-form" onSubmit={(e) => void submit(e)} noValidate>
      <label>
        New username
        <input
          className="text-input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          required
        />
        <span className="field-hint">
          The old Personal URL keeps opening this patient's sign-in until someone else takes
          @{current}; nobody else can take it for {USERNAME_LOCK_DAYS} days.
        </span>
      </label>
      {error && (
        <p className="library-note form-error" role="alert">
          {error}
        </p>
      )}
      <div className="save-row">
        <button type="submit" className="chip" disabled={busy}>
          {busy ? "Saving…" : "Save username"}
        </button>
        <button type="button" className="chip" onClick={onClose} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
