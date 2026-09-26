import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { AccountError, createPatient, fetchUsernameSuggestion } from "../lib/accounts";
import {
  checkNewPatient,
  generatePassword,
  normalizeUsername,
  PASSWORD_MIN_LENGTH,
} from "../../supabase/functions/_shared/accountRules.ts";
import type { CreatePatientError, UsernameLoginInput } from "../../supabase/functions/_shared/accountRules.ts";
import { LinkedCredentials, LinkRegisteredAccount } from "./LinkPatientForm";
import type { LinkedInstead } from "./LinkPatientForm";
import { PASSWORD_REFUSALS } from "./passwordMessages";
import { USERNAME_REFUSALS } from "./usernameMessages";

/**
 * "+ New patient" (ADR-014, ADR-016): a Clinician or the Admin creates a
 * Patient account with a name, an optional email, a Username (suggested from
 * the name, editable) and a password (typed or generated). The server
 * decides; this form only checks the fields first for quick feedback. An
 * email that already belongs to an account is refused; the Admin may link
 * that account as their Patient instead (#16), a Clinician may not.
 */

// Every refusal must have a message (satisfies); lookups take any server code.
const ERRORS: Partial<Record<string, string>> = {
  ...USERNAME_REFUSALS,
  ...PASSWORD_REFUSALS,
  name_required: "Enter the patient's name.",
  invalid_email: "That email doesn't look right — or leave it empty.",
  email_registered:
    "That email already belongs to a SwaraSanti account. Leave it empty, or use another email.",
  not_clinician: "Only clinicians can add patients.",
  patient_limit_reached: "You've reached your patient limit — contact us to expand it.",
} satisfies Record<CreatePatientError, string>;
const UNEXPECTED_ERROR = "Could not create the patient — try again later.";

/** What the form shows once done: the new Patient's sign-in, or the account the Admin linked instead. */
type Created = { kind: "created"; name: string; login: UsernameLoginInput } | ({ kind: "linked" } & LinkedInstead);

export function NewPatientForm({
  adminId,
  onCreated,
  onClose,
}: {
  /** The Admin, who may link a registered email's account instead; null for a Clinician. */
  adminId: string | null;
  onCreated: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  // Once the Clinician types a Username, suggestions stop overwriting it.
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  /** The email the server just called registered, while it is still the one typed. */
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);

  // Suggest a free Username for the name (debounced; the latest name wins).
  // A failed suggestion leaves the field for the Clinician to fill in.
  useEffect(() => {
    if (usernameEdited) return;
    if (name.trim().length === 0) {
      setUsername("");
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void fetchUsernameSuggestion(name)
        .then((suggested) => {
          if (!cancelled) setUsername(suggested ?? "");
        })
        .catch(() => undefined);
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [name, usernameEdited]);

  const reset = () => {
    setName("");
    setEmail("");
    setUsername("");
    setUsernameEdited(false);
    setPassword("");
    setError(null);
    setCreated(null);
    setRegisteredEmail(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const form = { name, email, username, password };
    const checked = checkNewPatient(form);
    if (!checked.ok) {
      setError(ERRORS[checked.error] ?? UNEXPECTED_ERROR);
      return;
    }
    setBusy(true);
    setError(null);
    setRegisteredEmail(null);
    try {
      const result = await createPatient(form);
      setCreated({ kind: "created", name: checked.patient.name, login: { username: result.username, password } });
      onCreated();
    } catch (err) {
      const code = err instanceof AccountError ? err.code : "";
      setError(ERRORS[code] ?? UNEXPECTED_ERROR);
      if (code === "email_registered") setRegisteredEmail(checked.patient.email);
    } finally {
      setBusy(false);
    }
  };

  const typedEmail = email.trim().toLowerCase();

  if (created) {
    return (
      <div className="new-patient-done" role="status">
        {created.kind === "created" ? (
          <>
            <p>
              <strong>{created.name}</strong> can now sign in on the SwaraSanti homepage with:
            </p>
            <dl>
              <dt>Username</dt>
              <dd>{created.login.username}</dd>
              <dt>Password</dt>
              <dd>{created.login.password}</dd>
            </dl>
            <p className="library-note">Share these with your patient.</p>
          </>
        ) : "login" in created ? (
          <>
            <p>
              <strong>{created.label}</strong> is now your patient.
            </p>
            <LinkedCredentials login={created.login} />
          </>
        ) : (
          <p>
            <strong>{created.label}</strong> is now your patient. They keep their username @{created.keptUsername}{" "}
            and their own password.
          </p>
        )}
        <div className="save-row">
          <button className="chip" onClick={reset}>
            Add another
          </button>
          <button className="chip" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="new-patient-form" onSubmit={(e) => void submit(e)} noValidate>
      <label>
        Name
        <input
          className="text-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          placeholder="Ivan Pratama"
          required
        />
      </label>
      <label>
        Email (optional)
        <input
          className="text-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="off"
          placeholder="For patients who have one"
        />
      </label>
      <label>
        Username
        <input
          className="text-input"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setUsernameEdited(e.target.value.trim().length > 0);
          }}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="ivan"
          required
        />
        <span className="field-hint">
          They sign in with this. 3–30 lowercase letters, numbers or hyphens.
        </span>
      </label>
      <label>
        Password
        <span className="field-row">
          <input
            className="text-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
            required
          />
          <button type="button" className="chip" onClick={() => setPassword(generatePassword())}>
            Generate
          </button>
        </span>
      </label>
      {error && (
        <p className="library-note form-error" role="alert">
          {error}
        </p>
      )}
      {adminId !== null && registeredEmail !== null && registeredEmail === typedEmail && (
        <LinkRegisteredAccount
          email={registeredEmail}
          login={{ username: normalizeUsername(username), password }}
          adminId={adminId}
          onLinked={(linked) => {
            setCreated({ kind: "linked", ...linked });
            onCreated();
          }}
        />
      )}
      <div className="save-row">
        <button type="submit" className="chip" disabled={busy}>
          {busy ? "Creating…" : "Create patient"}
        </button>
        <button type="button" className="chip" onClick={onClose} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
