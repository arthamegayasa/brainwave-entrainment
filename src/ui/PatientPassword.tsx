import { useState } from "react";
import type { FormEvent } from "react";
import { AccountError, resetPassword, revealPassword } from "../lib/accounts";
import {
  generatePassword,
  PASSWORD_MIN_LENGTH,
} from "../../supabase/functions/_shared/accountRules.ts";
import type {
  ResetPasswordError,
  RevealPasswordError,
} from "../../supabase/functions/_shared/accountRules.ts";
import { PASSWORD_REFUSALS } from "./passwordMessages";

/**
 * "Password ••••••" in the patient detail (#8, ADR-015): reveals the
 * Patient's current password, including one they chose in Account, and
 * offers a reset. The server decides who may do either and logs every reveal.
 */

// Every refusal must have a message (satisfies); lookups take any server code.
const ERRORS: Partial<Record<string, string>> = {
  not_allowed: "Only the Admin can see or reset this patient's password.",
  no_password_copy: "No password on file yet — reset it to set one.",
  ...PASSWORD_REFUSALS,
} satisfies Record<RevealPasswordError | ResetPasswordError, string>;
const UNEXPECTED_ERROR = "Could not reach the password — try again later.";

export function PatientPassword({
  patientId,
  flash,
}: {
  patientId: string;
  flash: (msg: string) => void;
}) {
  // The password on screen: revealed, or just set by a reset; null hides it.
  const [shown, setShown] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reveal = async () => {
    setBusy(true);
    setError(null);
    try {
      setShown(await revealPassword(patientId));
    } catch (err) {
      const code = err instanceof AccountError ? err.code : "";
      setError(ERRORS[code] ?? UNEXPECTED_ERROR);
    } finally {
      setBusy(false);
    }
  };

  const afterReset = (password: string) => {
    setResetting(false);
    setError(null);
    setShown(password);
    flash("Password reset ✓ Share the new one with your patient.");
  };

  return (
    <div className="detail-block">
      <h4>Password</h4>
      <div className="save-row">
        <span className="personal-url-address">{shown ?? "••••••"}</span>
        {shown === null ? (
          <button className="chip small" onClick={() => void reveal()} disabled={busy}>
            {busy ? "Revealing…" : "Reveal"}
          </button>
        ) : (
          <button className="chip small" onClick={() => setShown(null)}>
            Hide
          </button>
        )}
        {!resetting && (
          <button
            className="chip small"
            onClick={() => {
              setError(null);
              setResetting(true);
            }}
          >
            Reset password
          </button>
        )}
      </div>
      <p className="library-note">Every reveal is recorded.</p>
      {error && (
        <p className="library-note form-error" role="alert">
          {error}
        </p>
      )}
      {resetting && (
        <ResetPasswordForm
          patientId={patientId}
          onReset={afterReset}
          onClose={() => setResetting(false)}
        />
      )}
    </div>
  );
}

function ResetPasswordForm({
  patientId,
  onReset,
  onClose,
}: {
  patientId: string;
  onReset: (password: string) => void;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(PASSWORD_REFUSALS.password_too_short);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await resetPassword(patientId, password);
      onReset(password);
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
        New password
        <span className="field-row">
          <input
            className="text-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
            autoFocus
            required
          />
          <button type="button" className="chip" onClick={() => setPassword(generatePassword())}>
            Generate
          </button>
        </span>
        <span className="field-hint">
          The old password stops working right away, and your patient is signed out.
        </span>
      </label>
      {error && (
        <p className="library-note form-error" role="alert">
          {error}
        </p>
      )}
      <div className="save-row">
        <button type="submit" className="chip" disabled={busy}>
          {busy ? "Saving…" : "Save password"}
        </button>
        <button type="button" className="chip" onClick={onClose} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
