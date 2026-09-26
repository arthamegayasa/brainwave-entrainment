import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { AccountError, createPatient, fetchUsernameSuggestion } from "../lib/accounts";
import {
  checkNewPatient,
  generatePassword,
  PASSWORD_MIN_LENGTH,
} from "../../supabase/functions/_shared/accountRules.ts";
import type { CreatePatientError } from "../../supabase/functions/_shared/accountRules.ts";
import { USERNAME_REFUSALS } from "./usernameMessages";

/**
 * "+ New patient" (ADR-014, ADR-016): a Clinician or the Admin creates a
 * Patient account with a name, an optional email, a Username (suggested from
 * the name, editable) and a password (typed or generated). The server
 * decides; this form only checks the fields first for quick feedback.
 */

// Every refusal must have a message (satisfies); lookups take any server code.
const ERRORS: Partial<Record<string, string>> = {
  ...USERNAME_REFUSALS,
  name_required: "Enter the patient's name.",
  invalid_email: "That email doesn't look right — or leave it empty.",
  password_too_short: `Passwords need at least ${PASSWORD_MIN_LENGTH} characters.`,
  email_registered:
    "That email already belongs to a Serenade account. Leave it empty, or use another email.",
  not_clinician: "Only clinicians can add patients.",
  patient_limit_reached: "You've reached your patient limit — contact us to expand it.",
} satisfies Record<CreatePatientError, string>;
const UNEXPECTED_ERROR = "Could not create the patient — try again later.";

interface Created {
  name: string;
  username: string;
  password: string;
}

export function NewPatientForm({
  onCreated,
  onClose,
}: {
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
    try {
      const result = await createPatient(form);
      setCreated({ name: checked.patient.name, username: result.username, password });
      onCreated();
    } catch (err) {
      const code = err instanceof AccountError ? err.code : "";
      setError(ERRORS[code] ?? UNEXPECTED_ERROR);
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <div className="new-patient-done" role="status">
        <p>
          <strong>{created.name}</strong> can now sign in on the Serenade
          homepage with:
        </p>
        <dl>
          <dt>Username</dt>
          <dd>{created.username}</dd>
          <dt>Password</dt>
          <dd>{created.password}</dd>
        </dl>
        <p className="library-note">Share these with your patient.</p>
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
