import { useState } from "react";
import type { FormEvent } from "react";
import { AccountError, addUsernameLogin } from "../lib/accounts";
import { checkUsernameLogin } from "../../supabase/functions/_shared/accountRules.ts";
import type { AddUsernameLoginError, UsernameLoginInput } from "../../supabase/functions/_shared/accountRules.ts";
import {
  EMPTY_LOGIN,
  USERNAME_LOGIN_NOTE,
  USERNAME_LOGIN_REFUSALS,
  UsernameLoginFields,
} from "./UsernameLoginFields";

/**
 * "Username & password" for a Patient who has none yet (#16; ADR-014,
 * ADR-018): a User the Admin linked without one, or a Patient from the Invite
 * Code days. Their Clinician (unless the Patient is a Clinician too, active
 * or Inactive) or the Admin adds both; the Patient then signs in with an
 * internal login email and keeps their email as the contact email. The
 * server decides.
 */

// Every refusal must have a message (satisfies); lookups take any server code.
const ERRORS: Partial<Record<string, string>> = {
  ...USERNAME_LOGIN_REFUSALS,
  not_allowed: "Only the Admin can give a patient who is also a clinician a username and password.",
  not_linked: "They are no longer a patient.",
  has_username: "They have a username already.",
} satisfies Record<AddUsernameLoginError, string>;
const UNEXPECTED_ERROR = "Could not save — try again later.";

export function AddUsernameLogin({
  patientId,
  name,
  onAdded,
}: {
  patientId: string;
  /** Their name as given, to suggest a Username from; null without one. */
  name: string | null;
  /** Both were added; the password is shown once in their Password block. */
  onAdded: (login: UsernameLoginInput) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [login, setLogin] = useState(EMPTY_LOGIN);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const checked = checkUsernameLogin(login);
    if (!checked.ok) {
      setError(USERNAME_LOGIN_REFUSALS[checked.error]);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { username } = await addUsernameLogin(patientId, checked.login);
      await onAdded({ ...checked.login, username });
    } catch (err) {
      setError(ERRORS[err instanceof AccountError ? err.code : ""] ?? UNEXPECTED_ERROR);
      setBusy(false);
    }
  };

  return (
    <div className="detail-block">
      <h4>Username &amp; password</h4>
      {open ? (
        <form className="new-patient-form" onSubmit={(e) => void submit(e)} noValidate>
          <UsernameLoginFields login={login} onChange={setLogin} suggestFrom={name} />
          <p className="library-note">{USERNAME_LOGIN_NOTE}</p>
          {error && (
            <p className="library-note form-error" role="alert">
              {error}
            </p>
          )}
          <div className="save-row">
            <button type="submit" className="chip" disabled={busy}>
              {busy ? "Saving…" : "Save username & password"}
            </button>
            <button type="button" className="chip" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="save-row">
          <span className="library-note">No username yet.</span>
          <button className="chip small" onClick={() => setOpen(true)}>
            Add username &amp; password
          </button>
        </div>
      )}
    </div>
  );
}
