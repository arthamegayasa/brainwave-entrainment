import { useState } from "react";
import type { FormEvent } from "react";
import { AccountError, createClinician } from "../lib/accounts";
import {
  checkNewClinician,
  generatePassword,
  PASSWORD_MIN_LENGTH,
} from "../../supabase/functions/_shared/accountRules.ts";
import type { CreateClinicianError } from "../../supabase/functions/_shared/accountRules.ts";
import { PASSWORD_REFUSALS } from "./passwordMessages";

/**
 * "+ Create clinician" (#14; ADR-014, ADR-018): the Admin creates a Clinician
 * account with a name, the Clinician's own email and a password (typed or
 * generated). They sign in on the homepage with that email and password; the
 * role is granted by the Admin, so payments never take it away. The server
 * decides; this form only checks the fields first for quick feedback.
 */

// Every refusal must have a message (satisfies); lookups take any server code.
const ERRORS: Partial<Record<string, string>> = {
  ...PASSWORD_REFUSALS,
  name_required: "Enter the clinician's name.",
  invalid_email: "Enter the clinician's email — they sign in with it.",
  email_registered:
    "That email already belongs to a SwaraSanti account. Open that person in the table and use Make clinician instead.",
  not_allowed: "Only the Admin can create clinicians.",
} satisfies Record<CreateClinicianError, string>;
const UNEXPECTED_ERROR = "Could not create the clinician — try again later.";

interface Created {
  name: string;
  email: string;
  password: string;
}

export function NewClinicianForm({
  onCreated,
  onClose,
}: {
  onCreated: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);

  const reset = () => {
    setName("");
    setEmail("");
    setPassword("");
    setError(null);
    setCreated(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const form = { name, email, password };
    const checked = checkNewClinician(form);
    if (!checked.ok) {
      setError(ERRORS[checked.error] ?? UNEXPECTED_ERROR);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createClinician(form);
      setCreated(checked.clinician);
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
          <strong>{created.name}</strong> can now sign in on the SwaraSanti homepage with:
        </p>
        <dl>
          <dt>Email</dt>
          <dd>{created.email}</dd>
          <dt>Password</dt>
          <dd>{created.password}</dd>
        </dl>
        <p className="library-note">Share these with the clinician. You can reveal or reset the password later.</p>
        <div className="save-row">
          <button className="chip" onClick={reset}>
            Create another
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
          placeholder="Sari Dewi"
          required
        />
      </label>
      <label>
        Email
        <input
          className="text-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="sari@clinic.id"
          required
        />
        <span className="field-hint">They sign in with this email and the password below.</span>
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
          {busy ? "Creating…" : "Create clinician"}
        </button>
        <button type="button" className="chip" onClick={onClose} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
